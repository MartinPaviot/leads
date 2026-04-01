import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { sendEmail } from "../services/emailengine.js";
import { RateLimiter } from "../services/rate-limiter.js";
import { RotationEngine } from "../services/rotation.js";
import { sendQueue } from "../queues/index.js";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export function createSendWorker() {
  const worker = new Worker(
    "outbound:send",
    async (job) => {
      const { outboundEmailId } = job.data;

      // 1. Load the email
      const [email] = await sql`
        SELECT * FROM outbound_emails WHERE id = ${outboundEmailId}
      `;
      if (!email || email.status !== "queued") return;

      // 2. Check opt-out
      const [optout] = await sql`
        SELECT 1 FROM email_optouts
        WHERE tenant_id = ${email.tenant_id} AND email_address = ${email.to_address}
        LIMIT 1
      `;
      if (optout) {
        await sql`UPDATE outbound_emails SET status = 'skipped', updated_at = NOW() WHERE id = ${outboundEmailId}`;
        return;
      }

      // 3. Pick mailbox (from email or rotation)
      let mailbox;
      if (email.mailbox_id) {
        const [mb] = await sql`SELECT * FROM connected_mailboxes WHERE id = ${email.mailbox_id}`;
        mailbox = mb;
      } else {
        mailbox = await RotationEngine.pickMailbox(email.tenant_id);
      }

      if (!mailbox || mailbox.status !== "active") {
        // Re-queue with delay
        await sendQueue.add("send", { outboundEmailId }, { delay: 60_000 });
        return;
      }

      // 4. Check rate limits
      const canSend = await RateLimiter.check({
        id: mailbox.id,
        sentToday: mailbox.sent_today,
        dailyLimit: mailbox.daily_limit,
        sendWindowStart: mailbox.send_window_start,
        sendWindowEnd: mailbox.send_window_end,
        sendDays: mailbox.send_days,
        domain: mailbox.domain,
        bounceCount7d: mailbox.bounce_count_7d,
        sentTotal: mailbox.sent_total,
      });

      if (!canSend) {
        await sendQueue.add("send", { outboundEmailId }, { delay: 45_000 });
        return;
      }

      // 5. Send via EmailEngine
      try {
        await sql`UPDATE outbound_emails SET status = 'sending', updated_at = NOW() WHERE id = ${outboundEmailId}`;

        // Inject CAN-SPAM unsubscribe footer
        const unsubFooter = `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;">If you no longer wish to receive these emails, <a href="mailto:${mailbox.email_address}?subject=unsubscribe" style="color:#999;">click here to unsubscribe</a>.</div>`;
        const htmlWithFooter = email.body_html.includes("unsubscribe")
          ? email.body_html
          : email.body_html + unsubFooter;

        const result = await sendEmail(mailbox.ee_account_id, {
          from: { name: mailbox.display_name || "", address: mailbox.email_address },
          to: [{ address: email.to_address }],
          subject: email.subject,
          html: htmlWithFooter,
          text: email.body_text || undefined,
          inReplyTo: email.in_reply_to || undefined,
        });

        // 6. Update email record
        await sql`
          UPDATE outbound_emails SET
            status = 'sent',
            sent_at = NOW(),
            message_id = ${result.messageId},
            ee_message_id = ${result.id},
            mailbox_id = ${mailbox.id},
            from_address = ${mailbox.email_address},
            updated_at = NOW()
          WHERE id = ${outboundEmailId}
        `;

        // 7. Increment mailbox counters
        await sql`
          UPDATE connected_mailboxes SET
            sent_today = sent_today + 1,
            sent_total = sent_total + 1,
            updated_at = NOW()
          WHERE id = ${mailbox.id}
        `;
        await RateLimiter.recordSend(mailbox.id, mailbox.domain);

        // 8. Advance enrollment if applicable
        if (email.enrollment_id) {
          await sql`
            UPDATE sequence_enrollments SET
              current_step = current_step + 1,
              last_step_at = NOW()
            WHERE id = ${email.enrollment_id}
          `;
        }

        console.log(`[send] Sent email ${outboundEmailId} via ${mailbox.email_address} to ${email.to_address}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await sql`
          UPDATE outbound_emails SET
            status = 'failed',
            failed_at = NOW(),
            error_message = ${errMsg},
            updated_at = NOW()
          WHERE id = ${outboundEmailId}
        `;

        // Auth error → mark mailbox as error
        if (errMsg.includes("auth") || errMsg.includes("535") || errMsg.includes("Invalid credentials")) {
          await sql`UPDATE connected_mailboxes SET status = 'error', updated_at = NOW() WHERE id = ${mailbox.id}`;
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
