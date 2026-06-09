/**
 * Handler for email/auto-pipeline-draft events.
 *
 * When the autonomous pipeline decides to send a follow-up, it fires
 * this event with the email draft. This handler creates the outbound
 * email row (status: "queued") so the email-send-worker picks it up
 * on its next 2-minute cron cycle.
 *
 * Without this handler, the autonomous pipeline's email decisions
 * disappeared into the Inngest void — the event was sent but nobody
 * listened.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { outboundEmails, contacts, deals } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getOwnerMailbox } from "@/lib/integrations/owner-mailbox";

export const handleAutoPipelineDraft = inngest.createFunction(
  {
    id: "auto-pipeline-email-handler",
    retries: 1,
    triggers: [{ event: "email/auto-pipeline-draft" }],
  },
  async ({ event }: {
    event: {
      data: {
        tenantId: string;
        dealId: string;
        contactId?: string;
        subject: string;
        body: string;
        action: string;
        confidence: number;
      };
    };
  }) => {
    const { tenantId, dealId, contactId, subject, body, action, confidence } = event.data;

    if (!contactId) {
      return { error: "No contactId — cannot send email without a recipient" };
    }

    // Look up the contact's email
    const [contact] = await db
      .select({ email: contacts.email, firstName: contacts.firstName })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);

    if (!contact?.email) {
      return { error: "Contact has no email address" };
    }

    // Personal mailboxes: send from the DEAL OWNER's mailbox, never a
    // colleague's. Falls back to the neutral system sender (below) when the
    // owner is unknown or has no active connected mailbox.
    const [deal] = await db
      .select({ ownerId: deals.ownerId })
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
      .limit(1);
    const mailbox = await getOwnerMailbox(tenantId, deal?.ownerId);

    // Idempotency: check if we already queued an email for this deal+contact today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [existing] = await db
      .select({ id: outboundEmails.id })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, tenantId),
          eq(outboundEmails.contactId, contactId),
          eq(outboundEmails.campaignId, dealId),
          sql`${outboundEmails.queuedAt} >= ${today.toISOString()}::timestamptz`,
        ),
      )
      .limit(1);

    if (existing) {
      return { skipped: true, reason: "Already queued an email for this deal+contact today", existingId: existing.id };
    }

    // Create the outbound email row as "queued" — the email-send-worker
    // will pick it up on its next cron cycle (every 2 minutes).
    const [created] = await db
      .insert(outboundEmails)
      .values({
        tenantId,
        contactId,
        campaignId: dealId,
        mailboxId: mailbox?.id || null,
        fromAddress: mailbox?.emailAddress || "Elevay <outbound@resend.dev>",
        toAddress: contact.email,
        subject,
        bodyHtml: `<p>${body.replace(/\n/g, "</p><p>")}</p>`,
        bodyText: body,
        status: "queued",
        queuedAt: new Date(),
      })
      .returning({ id: outboundEmails.id });

    return {
      emailId: created?.id,
      to: contact.email,
      subject,
      action,
      confidence,
      mailbox: mailbox?.emailAddress || "fallback",
    };
  },
);
