import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { sendEmail } from "../services/emailengine.js";
import { buildUnsubscribeUrl } from "../services/unsubscribe.js";
import { RateLimiter } from "../services/rate-limiter.js";
import { RotationEngine } from "../services/rotation.js";
import { sendQueue } from "../queues/index.js";
import { db, connectedMailboxes, outboundEmails, emailOptouts, sequenceEnrollments, pipelineEvents } from "../db.js";
import { eq, and, sql } from "drizzle-orm";

export function createSendWorker() {
  const worker = new Worker(
    "outbound:send",
    async (job) => {
      const { outboundEmailId } = job.data;

      const [email] = await db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.id, outboundEmailId));
      if (!email || email.status !== "queued") return;

      const [optout] = await db
        .select()
        .from(emailOptouts)
        .where(
          and(
            eq(emailOptouts.tenantId, email.tenantId),
            eq(emailOptouts.emailAddress, email.toAddress)
          )
        )
        .limit(1);

      if (optout) {
        await db
          .update(outboundEmails)
          .set({ status: "skipped", updatedAt: new Date() })
          .where(eq(outboundEmails.id, outboundEmailId));
        return;
      }

      let mailbox;
      if (email.mailboxId) {
        const [mb] = await db
          .select()
          .from(connectedMailboxes)
          .where(eq(connectedMailboxes.id, email.mailboxId));
        mailbox = mb;
      } else {
        mailbox = await RotationEngine.pickMailbox(email.tenantId);
      }

      if (!mailbox || mailbox.status !== "active") {
        await sendQueue.add("send", { outboundEmailId }, { delay: 60_000 });
        return;
      }

      const canSend = await RateLimiter.check({
        id: mailbox.id,
        sentToday: mailbox.sentToday,
        dailyLimit: mailbox.dailyLimit,
        sendWindowStart: mailbox.sendWindowStart || "08:00",
        sendWindowEnd: mailbox.sendWindowEnd || "18:00",
        sendDays: (mailbox.sendDays || []) as string[],
        domain: mailbox.domain,
        bounceCount7d: mailbox.bounceCount7d,
        sentTotal: mailbox.sentTotal,
      });

      if (!canSend) {
        await sendQueue.add("send", { outboundEmailId }, { delay: 45_000 });
        return;
      }

      try {
        await db
          .update(outboundEmails)
          .set({ status: "sending", updatedAt: new Date() })
          .where(eq(outboundEmails.id, outboundEmailId));

        const unsubFooter = `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;">If you no longer wish to receive these emails, <a href="mailto:${mailbox.emailAddress}?subject=unsubscribe" style="color:#999;">click here to unsubscribe</a>.</div>`;
        const htmlWithFooter = email.bodyHtml.includes("unsubscribe")
          ? email.bodyHtml
          : email.bodyHtml + unsubFooter;

        // RFC-8058 One-Click unsubscribe header — parity with the Inngest send
        // path (email-send-worker.ts). Gmail/Yahoo bulk-sender rules require it;
        // the mailto footer below is the human fallback, not a substitute.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.com";
        const unsubUrl = buildUnsubscribeUrl(appUrl, email.tenantId, email.toAddress);

        const result = await sendEmail(mailbox.eeAccountId, {
          from: { name: mailbox.displayName || "", address: mailbox.emailAddress },
          to: [{ address: email.toAddress }],
          subject: email.subject,
          html: htmlWithFooter,
          text: email.bodyText || undefined,
          inReplyTo: email.inReplyTo || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        await db
          .update(outboundEmails)
          .set({
            status: "sent",
            sentAt: new Date(),
            messageId: result.messageId,
            eeMessageId: result.id,
            mailboxId: mailbox.id,
            fromAddress: mailbox.emailAddress,
            updatedAt: new Date(),
          })
          .where(eq(outboundEmails.id, outboundEmailId));

        await db
          .update(connectedMailboxes)
          .set({
            sentToday: sql`${connectedMailboxes.sentToday} + 1`,
            sentTotal: sql`${connectedMailboxes.sentTotal} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(connectedMailboxes.id, mailbox.id));

        await RateLimiter.recordSend(mailbox.id, mailbox.domain);

        if (email.enrollmentId) {
          await db
            .update(sequenceEnrollments)
            .set({
              currentStep: sql`${sequenceEnrollments.currentStep} + 1`,
              lastStepAt: new Date(),
            })
            .where(eq(sequenceEnrollments.id, email.enrollmentId));
        }

        await db
          .insert(pipelineEvents)
          .values({
            traceId: email.enrollmentId || outboundEmailId,
            tenantId: email.tenantId,
            contactId: email.contactId,
            enrollmentId: email.enrollmentId,
            outboundEmailId,
            stage: "email_sent",
            sourceSystem: "bullmq",
            metadata: { via: "emailengine", mailbox: mailbox.emailAddress },
          })
          .catch(() => {});

        console.log(`[send] Sent email ${outboundEmailId} via ${mailbox.emailAddress} to ${email.toAddress}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db
          .update(outboundEmails)
          .set({
            status: "failed",
            failedAt: new Date(),
            errorMessage: errMsg,
            updatedAt: new Date(),
          })
          .where(eq(outboundEmails.id, outboundEmailId));

        if (errMsg.includes("auth") || errMsg.includes("535") || errMsg.includes("Invalid credentials")) {
          await db
            .update(connectedMailboxes)
            .set({ status: "error", updatedAt: new Date() })
            .where(eq(connectedMailboxes.id, mailbox.id));
        }

        console.error(`[send] Failed ${outboundEmailId}:`, errMsg);
      }
    },
    {
      connection,
      concurrency: 8,
      limiter: { max: 20, duration: 60_000 },
    }
  );

  worker.on("error", (err) => console.error("[send-worker] Error:", err));
  return worker;
}
