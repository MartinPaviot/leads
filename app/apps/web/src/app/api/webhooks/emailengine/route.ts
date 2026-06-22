import { db } from "@/db";
import { outboundEmails, connectedMailboxes, emailOptouts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { inngest } from "@/inngest/client";
import type { AgentTrigger } from "@/lib/agent-reactor/types";
import { captureInboundEmail } from "@/lib/capture/email-capture";

function verifyWebhookSignature(body: string, signature: string | null): boolean {
  const secret = process.env.EMAILENGINE_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-ee-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  switch (event.event) {
    case "messageNew": {
      const { account, from, to, subject, text, messageId, threadId, headers: rawHeaders } = event.data || {};

      // EmailEngine includes RFC headers in `messageNew` when the webhook is
      // configured with notifyHeaders. Normalise the object/array shape to a
      // lower-cased record so the classifier sees List-Unsubscribe / Precedence;
      // absent ⇒ null (capture falls back to role-local-part detection).
      const eeHeaders: Record<string, string> = {};
      if (rawHeaders && typeof rawHeaders === "object") {
        const entries = Array.isArray(rawHeaders)
          ? (rawHeaders as Array<{ key?: string; name?: string; value?: string; line?: string }>).map(
              (h) => [h.key ?? h.name, h.value ?? h.line] as const,
            )
          : Object.entries(rawHeaders as Record<string, unknown>);
        for (const [k, v] of entries) {
          if (typeof k === "string") {
            eeHeaders[k.toLowerCase()] = Array.isArray(v) ? v.map((x) => String(x)).join(", ") : String(v ?? "");
          }
        }
      }

      // Resolve the receiving tenant from the connected mailbox, so inbound
      // that isn't tied to one of our outbound threads can still be captured.
      let tenantId: string | null = null;
      if (account) {
        const [mb] = await db
          .select({ tenantId: connectedMailboxes.tenantId })
          .from(connectedMailboxes)
          .where(eq(connectedMailboxes.eeAccountId, account))
          .limit(1);
        tenantId = mb?.tenantId ?? null;
      }

      // Reply to a tracked outbound? Flip its reply flag (existing behaviour)
      // and remember the contact so the captured inbound links to them.
      let knownContactId: string | null = null;
      if (threadId) {
        const [outbound] = await db
          .select()
          .from(outboundEmails)
          .where(eq(outboundEmails.threadId, threadId))
          .limit(1);

        if (outbound) {
          tenantId = tenantId ?? outbound.tenantId;
          knownContactId = outbound.contactId ?? null;

          // Push to reply classification queue via Redis; fall back to a
          // direct flag update.
          const replyRedisUrl = process.env.REDIS_URL || "redis://localhost:6379";
          try {
            await fetch(`${replyRedisUrl.replace("redis://", "http://").replace(":6379", ":3100")}/v1/queue/outbound:reply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                outboundEmailId: outbound.id,
                replyText: text,
                replyFrom: from,
                replyMessageId: messageId,
              }),
            });
          } catch {
            // Direct DB update as fallback
            await db
              .update(outboundEmails)
              .set({
                repliedAt: new Date(),
                replySnippet: (text || "").substring(0, 200),
                updatedAt: new Date(),
              })
              .where(eq(outboundEmails.id, outbound.id));
          }
        }
      }

      // Capture the inbound message itself as a first-class activity (full
      // body, threaded, linked to the contact/company) — not just a reply
      // flag, and including inbound that never matched an outbound thread.
      // Idempotent on messageId; non-fatal on failure.
      if (tenantId) {
        // EmailEngine may deliver the HTML part at `data.html` (string) or inside
        // a `data.text` object — accept either, ignore anything else (R01/R13).
        const eeData = (event.data ?? {}) as Record<string, unknown>;
        const eeHtml =
          typeof eeData.html === "string"
            ? eeData.html
            : eeData.text && typeof eeData.text === "object" && typeof (eeData.text as Record<string, unknown>).html === "string"
              ? ((eeData.text as Record<string, unknown>).html as string)
              : null;
        await captureInboundEmail({
          tenantId,
          fromHeader: from || "",
          toHeader: Array.isArray(to) ? to.join(", ") : (to ?? null),
          subject: subject ?? null,
          text: text ?? null,
          html: eeHtml,
          messageId: messageId ?? null,
          threadId: threadId ?? null,
          knownContactId,
          headers: Object.keys(eeHeaders).length ? eeHeaders : null,
        }).catch((e) => console.warn("emailengine: inbound capture failed", e));
      }

      break;
    }

    case "messageBounce": {
      const { account, messageId, bounceMessage } = event.data || {};

      // Find the outbound email by message ID
      if (messageId) {
        const [outbound] = await db
          .select()
          .from(outboundEmails)
          .where(eq(outboundEmails.messageId, messageId))
          .limit(1);

        if (outbound) {
          const isHardBounce = bounceMessage?.includes("550") || bounceMessage?.includes("User unknown");
          const bounceType = isHardBounce ? "hard" : "soft";

          await db
            .update(outboundEmails)
            .set({
              status: "bounced",
              bouncedAt: new Date(),
              bounceType,
              errorMessage: bounceMessage,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, outbound.id));

          // Hard bounce → opt-out
          if (isHardBounce) {
            await db
              .insert(emailOptouts)
              .values({
                tenantId: outbound.tenantId,
                emailAddress: outbound.toAddress.toLowerCase(),
                reason: "bounce_hard",
              })
              .onConflictDoNothing();
          }

          // Increment bounce count on mailbox
          if (outbound.mailboxId) {
            await db
              .update(connectedMailboxes)
              .set({
                bounceCount7d: sql`bounce_count_7d + 1`,
                updatedAt: new Date(),
              })
              .where(eq(connectedMailboxes.id, outbound.mailboxId));
          }

          // F001: Fire agent reactor for bounce
          if (outbound.contactId) {
            await inngest.send({
              name: "agent/react",
              data: {
                tenantId: outbound.tenantId,
                trigger: "email_bounced" as AgentTrigger,
                entityType: "contact" as const,
                entityId: outbound.contactId,
                metadata: { emailId: outbound.id, bounceType },
                deduplicationKey: `email_bounced:contact:${outbound.contactId}`,
                firedAt: new Date().toISOString(),
              },
            }).catch(() => {});
          }
        }
      }

      break;
    }
  }

  // F001: Fire agent reactor for inbound email / reply
  if (event.event === "messageNew") {
    const { threadId } = event.data || {};
    if (threadId) {
      const [outbound] = await db
        .select({ id: outboundEmails.id, tenantId: outboundEmails.tenantId, contactId: outboundEmails.contactId })
        .from(outboundEmails)
        .where(eq(outboundEmails.threadId, threadId))
        .limit(1);
      if (outbound?.contactId) {
        await inngest.send({
          name: "agent/react",
          data: {
            tenantId: outbound.tenantId,
            trigger: "email_replied" as AgentTrigger,
            entityType: "contact" as const,
            entityId: outbound.contactId,
            metadata: { emailId: outbound.id, threadId },
            deduplicationKey: `email_replied:contact:${outbound.contactId}`,
            firedAt: new Date().toISOString(),
          },
        }).catch(() => {});
      }
    }
  }

  return Response.json({ ok: true });
}
