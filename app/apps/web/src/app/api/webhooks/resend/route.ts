import { db } from "@/db";
import { outboundEmails, connectedMailboxes, sequenceEnrollments, emailOptouts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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
    const body = await req.json();
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
          await db.update(sequenceEnrollments).set({
            status: "paused",
          }).where(eq(sequenceEnrollments.id, email.enrollmentId));

          // Add to optout list
          await db.insert(emailOptouts).values({
            tenantId: email.tenantId,
            emailAddress: email.toAddress,
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
          emailAddress: email.toAddress,
          reason: "unsubscribe",
        }).onConflictDoNothing();

        // Pause enrollment
        if (email.enrollmentId) {
          await db.update(sequenceEnrollments).set({
            status: "paused",
          }).where(eq(sequenceEnrollments.id, email.enrollmentId));
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
