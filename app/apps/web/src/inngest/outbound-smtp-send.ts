/**
 * Dispatch queued outbound emails via the tenant's connected SMTP mailbox
 * (provider "smtp_custom") — the EmailEngine-free send path.
 *
 * `sendSequenceStep` only QUEUES an `outbound_emails` row (status "queued",
 * fromAddress "pending@rotation"); the actual send used to be the job of the
 * (undeployed) BullMQ worker via EmailEngine, so nothing ever left. This cron
 * drains the queue for IMAP/SMTP tenants and sends as the user from their own
 * mailbox. Gmail/OAuth tenants are left untouched (no smtp_custom mailbox).
 *
 * Idempotency: each row is sent inside its own `step.run("send-<id>")`, so an
 * Inngest retry replays the memoised result instead of re-sending.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { outboundEmails, connectedMailboxes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendViaSmtp } from "@/lib/integrations/smtp-send";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { logger } from "@/lib/observability/logger";

const BATCH = 25;

export const dispatchOutboundSmtp = inngest.createFunction(
  {
    id: "dispatch-outbound-smtp",
    name: "Dispatch queued outbound via SMTP",
    retries: 1,
    triggers: [{ cron: "*/2 * * * *" }],
  },
  async ({ step }) => {
    const queued = await step.run("find-queued", async () => {
      return db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.status, "queued"))
        .limit(BATCH);
    });
    if (queued.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const o of queued) {
      const result = await step.run(`send-${o.id}`, async () => {
        // Resolve the tenant's active SMTP mailbox. If none, this tenant isn't
        // on the IMAP/SMTP path — leave the row queued for its own sender.
        const [mb] = await db
          .select()
          .from(connectedMailboxes)
          .where(
            and(
              eq(connectedMailboxes.tenantId, o.tenantId),
              eq(connectedMailboxes.provider, "smtp_custom"),
              eq(connectedMailboxes.status, "active"),
            ),
          )
          .limit(1);
        if (!mb || !mb.smtpHost || !mb.secretEncrypted) return "skipped";
        if ((mb.sentToday ?? 0) >= (mb.dailyLimit ?? 50)) return "skipped";

        try {
          const password = decryptSecret(mb.secretEncrypted);
          const { messageId } = await sendViaSmtp(
            {
              emailAddress: mb.emailAddress,
              smtpHost: mb.smtpHost,
              smtpPort: mb.smtpPort,
              password,
              displayName: mb.displayName,
            },
            {
              to: o.toAddress,
              subject: o.subject,
              html: o.bodyHtml,
              text: o.bodyText || undefined,
              inReplyTo: o.inReplyTo,
            },
          );
          await db
            .update(outboundEmails)
            .set({
              status: "sent",
              sentAt: new Date(),
              messageId,
              fromAddress: mb.emailAddress,
              mailboxId: mb.id,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, o.id));
          await db
            .update(connectedMailboxes)
            .set({
              sentToday: sql`${connectedMailboxes.sentToday} + 1`,
              sentTotal: sql`${connectedMailboxes.sentTotal} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(connectedMailboxes.id, mb.id));
          return "sent";
        } catch (err) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, o.id));
          logger.warn?.("dispatch-outbound-smtp: send failed", { outboundId: o.id, tenantId: o.tenantId });
          return "failed";
        }
      });
      if (result === "sent") sent++;
      else if (result === "failed") failed++;
      else skipped++;
    }

    return { sent, failed, skipped };
  },
);
