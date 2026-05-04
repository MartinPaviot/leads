import { db } from "@/db";
import { outboundEmails, connectedMailboxes, emailOptouts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { inngest } from "@/inngest/client";
import type { AgentTrigger } from "@/lib/agent-reactor/types";

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
      const { account, from, to, subject, text, messageId, threadId } = event.data || {};

      // Check if this is a reply to an outbound email
      if (threadId) {
        const [outbound] = await db
          .select()
          .from(outboundEmails)
          .where(eq(outboundEmails.threadId, threadId))
          .limit(1);

        if (outbound) {
          // Push to reply classification queue via Redis
          // For now, store the reply data directly
          const replyRedisUrl = process.env.REDIS_URL || "redis://localhost:6379";
          try {
            const res = await fetch(`${replyRedisUrl.replace("redis://", "http://").replace(":6379", ":3100")}/v1/queue/outbound:reply`, {
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
                emailAddress: outbound.toAddress,
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
