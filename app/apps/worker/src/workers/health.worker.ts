import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { getAccountStatus } from "../services/emailengine.js";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export function createHealthWorker() {
  const worker = new Worker(
    "outbound:health",
    async (job) => {
      const { mailboxId } = job.data;

      const [mailbox] = await sql`
        SELECT * FROM connected_mailboxes WHERE id = ${mailboxId}
      `;
      if (!mailbox) return;

      try {
        const status = await getAccountStatus(mailbox.ee_account_id);

        // Calculate health score
        let healthScore = 100;

        // Penalize for bounces
        if (mailbox.bounce_count_7d > 5) healthScore -= 30;
        else if (mailbox.bounce_count_7d > 2) healthScore -= 15;

        // Penalize for low reply rate (need some sends first)
        if (mailbox.sent_total > 50) {
          const replyRate = mailbox.reply_count_7d / Math.min(mailbox.sent_total, 100);
          if (replyRate < 0.01) healthScore -= 10;
        }

        // Penalize for EmailEngine connection issues
        if (status.state !== "connected") healthScore -= 40;

        healthScore = Math.max(0, Math.min(100, healthScore));

        await sql`
          UPDATE connected_mailboxes SET
            health_score = ${healthScore},
            updated_at = NOW()
          WHERE id = ${mailboxId}
        `;

        // Auto-pause if health is critically low
        if (healthScore < 20 && mailbox.status === "active") {
          await sql`
            UPDATE connected_mailboxes SET status = 'paused', updated_at = NOW()
            WHERE id = ${mailboxId}
          `;
          console.warn(`[health] Auto-paused mailbox ${mailbox.email_address} (health: ${healthScore})`);
        }

        // Reset sent_today at midnight (check if it's a new day)
        const lastUpdate = new Date(mailbox.updated_at);
        const now = new Date();
        if (lastUpdate.toDateString() !== now.toDateString()) {
          await sql`
            UPDATE connected_mailboxes SET sent_today = 0, updated_at = NOW()
            WHERE id = ${mailboxId}
          `;
        }

        console.log(`[health] Mailbox ${mailbox.email_address}: score=${healthScore}, state=${status.state}`);
      } catch (err) {
        console.error(`[health] Check failed for ${mailbox.email_address}:`, err);
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on("error", (err) => console.error("[health-worker] Error:", err));
  return worker;
}
