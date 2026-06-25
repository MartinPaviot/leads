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
 * Idempotency: each row is atomically CLAIMED (queued -> sending, RETURNING) right
 * before the wire. A retry that replays this step — or the campaign-worker cron,
 * which also drains "queued" — re-runs the claim, gets 0 rows (no longer "queued"),
 * and skips. So a prospect is mailed at most once. (step.run does NOT prevent a
 * re-send on a throw-AFTER-send; only the claim does — the old comment was wrong.)
 */

import { inngest } from "./client";
import { db } from "@/db";
import { outboundEmails, connectedMailboxes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendViaSmtp } from "@/lib/integrations/smtp-send";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { logger } from "@/lib/observability/logger";
import { isRecipientAllowed, recipientBlockReason } from "@/lib/emails/recipient-guardrail";
import { evaluateSend } from "@/lib/guardrails/sending-gate";

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
        // TEST-MODE GUARDRAIL — never reach a real prospect over SMTP while
        // test mode is on. Fail the row with a clear reason instead.
        if (!isRecipientAllowed(o.toAddress)) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: recipientBlockReason(o.toAddress),
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, o.id));
          return "failed";
        }

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

        // CLE-13 (items 1 + 3): opt-out/suppression + sending-identity gate. This
        // path had NO opt-out check before — the shared gate closes that gap
        // (hard-bounce covered via the same email_optouts lookup). cap-hit leaves
        // the row queued (treated as skipped) so it retries; every other block
        // (opt-out / cold / managed) fails the row with the reason.
        const smtpGate = await evaluateSend({
          tenantId: o.tenantId,
          toAddress: o.toAddress,
          sentTodayFromPrimary: mb.sentToday ?? 0,
          contactId: o.contactId, // spec 35 — account-scope suppression + targeting
        });
        if (!smtpGate.send) {
          if (smtpGate.code === "primary-cap-hit") return "skipped";
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: smtpGate.reason,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, o.id));
          return "failed";
        }

        // Atomic claim: flip queued -> sending so EXACTLY ONE worker sends this row.
        // The campaign-worker cron also drains "queued", and an Inngest retry replays
        // this whole step on a throw — both re-run this conditional UPDATE and get 0
        // rows back once the row has left "queued", so they skip without re-sending.
        // This is the real send-once guarantee (step.run memoisation does NOT cover a
        // crash AFTER the wire but before the status write).
        const claimed = await db
          .update(outboundEmails)
          .set({ status: "sending", updatedAt: new Date() })
          .where(and(eq(outboundEmails.id, o.id), eq(outboundEmails.status, "queued")))
          .returning({ id: outboundEmails.id });
        if (claimed.length === 0) return "skipped";

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
