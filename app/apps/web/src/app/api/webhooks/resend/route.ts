import { db } from "@/db";
import { outboundEmails, connectedMailboxes, sequenceEnrollments, emailOptouts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { pauseEnrollment } from "@/lib/enrollment";

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * Resend uses Svix under the hood; the canonical message is
 *   `${svix-id}.${svix-timestamp}.${rawBody}`
 * and the header `svix-signature` carries one or more `v1,<base64>` parts.
 *
 * We accept the request if any provided signature matches.
 *
 * In dev (no `RESEND_WEBHOOK_SECRET` set), we accept everything to ease
 * local testing. In prod, the secret MUST be configured.
 */
function verifyResendSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatureHeader = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject very old timestamps (>5 min skew) to limit replay window
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  // Svix secrets are stored as `whsec_<base64>`; the signing key is the
  // base64-decoded portion after the prefix.
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");

  const toSign = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  // Header looks like "v1,sig1 v1,sig2"; accept any matching v1 entry
  const candidates = signatureHeader
    .split(" ")
    .filter((p) => p.startsWith("v1,"))
    .map((p) => p.slice("v1,".length));

  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resend webhook handler — processes email delivery events.
 * Configure in Resend dashboard: POST https://your-domain/api/webhooks/resend
 *
 * Events handled:
 * - email.delivered — marks email as delivered
 * - email.opened — records open timestamp
 * - email.clicked — records click timestamp
 * - email.bounced — marks bounce, pauses enrollment, updates mailbox health
 * - email.complained — spam complaint, adds to optout list, pauses enrollment
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (!verifyResendSignature(req, rawBody)) {
      console.warn("Rejected Resend webhook: invalid signature");
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { type, data } = body;

    if (!type || !data) {
      return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // Resend includes the message ID we stored when sending
    const messageId = data.email_id || data.message_id;
    if (!messageId) {
      return Response.json({ ok: true }); // Ignore events without message ID
    }

    // Find the outbound email by Resend message ID
    const [email] = await db
      .select()
      .from(outboundEmails)
      .where(eq(outboundEmails.messageId, messageId))
      .limit(1);

    if (!email) {
      return Response.json({ ok: true }); // Unknown email, ignore
    }

    switch (type) {
      case "email.delivered": {
        await db.update(outboundEmails).set({
          status: "delivered",
          deliveredAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(outboundEmails.id, email.id));
        break;
      }

      case "email.opened": {
        // Only record first open
        if (!email.openedAt) {
          await db.update(outboundEmails).set({
            openedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(outboundEmails.id, email.id));
        }
        break;
      }

      case "email.clicked": {
        if (!email.clickedAt) {
          await db.update(outboundEmails).set({
            clickedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(outboundEmails.id, email.id));
        }
        break;
      }

      case "email.bounced": {
        const bounceType = data.bounce?.type === "hard" ? "permanent" : "temporary";

        await db.update(outboundEmails).set({
          status: "bounced",
          bouncedAt: new Date(),
          bounceType,
          errorMessage: data.bounce?.description || "Email bounced",
          updatedAt: new Date(),
        }).where(eq(outboundEmails.id, email.id));

        // Update mailbox bounce counter
        if (email.mailboxId) {
          await db.update(connectedMailboxes).set({
            bounceCount7d: sql`${connectedMailboxes.bounceCount7d} + 1`,
            updatedAt: new Date(),
          }).where(eq(connectedMailboxes.id, email.mailboxId));
        }

        // Hard bounce: pause enrollment + add to optout list
        if (bounceType === "permanent" && email.enrollmentId) {
          await pauseEnrollment(email.enrollmentId, "bounced");

          // Add to optout list
          await db.insert(emailOptouts).values({
            tenantId: email.tenantId,
            emailAddress: email.toAddress.toLowerCase(),
            reason: "bounce_hard",
          }).onConflictDoNothing();
        }
        break;
      }

      case "email.complained": {
        // Spam complaint — severe, add to optout and pause
        await db.update(outboundEmails).set({
          status: "bounced",
          bouncedAt: new Date(),
          bounceType: "complaint",
          errorMessage: "Spam complaint received",
          updatedAt: new Date(),
        }).where(eq(outboundEmails.id, email.id));

        // Add to global optout list
        await db.insert(emailOptouts).values({
          tenantId: email.tenantId,
          emailAddress: email.toAddress.toLowerCase(),
          reason: "unsubscribe",
        }).onConflictDoNothing();

        // Pause enrollment
        if (email.enrollmentId) {
          await pauseEnrollment(email.enrollmentId, "complained");
        }

        // Update mailbox health
        if (email.mailboxId) {
          await db.update(connectedMailboxes).set({
            bounceCount7d: sql`${connectedMailboxes.bounceCount7d} + 1`,
            healthScore: sql`GREATEST(${connectedMailboxes.healthScore} - 10, 0)`,
            updatedAt: new Date(),
          }).where(eq(connectedMailboxes.id, email.mailboxId));
        }
        break;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
