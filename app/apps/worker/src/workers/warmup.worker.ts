import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { sendEmail } from "../services/emailengine.js";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const WARMUP_SUBJECTS = [
  "Quick question about your experience",
  "Following up on our conversation",
  "Thoughts on the latest update?",
  "Re: Meeting agenda for next week",
  "Have you seen this article?",
  "Thanks for the introduction",
  "Checking in on the project",
  "Great news to share",
];

const WARMUP_BODIES = [
  "Hi, I wanted to follow up on our earlier conversation. Let me know if you have any questions.",
  "Thanks for getting back to me! I appreciate your time.",
  "Just checking in to see how things are going on your end.",
  "Sounds great, let's schedule a time to discuss further.",
  "I appreciate the update. Looking forward to next steps.",
];

export function createWarmupWorker() {
  const worker = new Worker(
    "outbound:warmup",
    async (job) => {
      const { mailboxId } = job.data;

      // Find the mailbox
      const [mailbox] = await sql`
        SELECT * FROM connected_mailboxes WHERE id = ${mailboxId} AND status = 'warming_up'
      `;
      if (!mailbox) return;

      // Find a random target mailbox from another tenant (or same tenant, different mailbox)
      const [target] = await sql`
        SELECT * FROM connected_mailboxes
        WHERE id != ${mailboxId} AND status IN ('warming_up', 'active')
        ORDER BY RANDOM() LIMIT 1
      `;
      if (!target) {
        console.log(`[warmup] No target mailbox found for ${mailbox.email_address}`);
        return;
      }

      const subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      const body = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

      try {
        const result = await sendEmail(mailbox.ee_account_id, {
          from: { name: mailbox.display_name || "", address: mailbox.email_address },
          to: [{ address: target.email_address }],
          subject,
          html: `<p>${body}</p>`,
        });

        // Record warmup email
        await sql`
          INSERT INTO warmup_emails (id, mailbox_id, target_mailbox_id, direction, message_id, status)
          VALUES (gen_random_uuid(), ${mailboxId}, ${target.id}, 'sent', ${result.messageId}, 'sent')
        `;

        // Update sent counters
        await sql`
          UPDATE connected_mailboxes SET
            sent_today = sent_today + 1,
            sent_total = sent_total + 1,
            updated_at = NOW()
          WHERE id = ${mailboxId}
        `;

        console.log(`[warmup] Sent from ${mailbox.email_address} to ${target.email_address}`);

        // Check graduation: 21+ days and target reached 50/day
        const daysSinceStart = mailbox.warmup_started_at
          ? Math.floor((Date.now() - new Date(mailbox.warmup_started_at).getTime()) / 86400000)
          : 0;

        if (daysSinceStart >= 21 && mailbox.warmup_daily_target >= 50) {
          await sql`
            UPDATE connected_mailboxes SET
              status = 'active',
              warmup_completed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${mailboxId}
          `;
          console.log(`[warmup] Mailbox ${mailbox.email_address} graduated to active!`);
        }
      } catch (err) {
        console.error(`[warmup] Failed for ${mailbox.email_address}:`, err);
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on("error", (err) => console.error("[warmup-worker] Error:", err));
  return worker;
}
