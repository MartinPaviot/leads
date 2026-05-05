import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { getAccountStatus } from "../services/emailengine.js";
import { db, connectedMailboxes } from "../db.js";
import { eq } from "drizzle-orm";

export function createHealthWorker() {
  const worker = new Worker(
    "outbound:health",
    async (job) => {
      const { mailboxId } = job.data;

      const [mailbox] = await db
        .select()
        .from(connectedMailboxes)
        .where(eq(connectedMailboxes.id, mailboxId));
      if (!mailbox) return;

      try {
        const status = await getAccountStatus(mailbox.eeAccountId);

        let healthScore = 100;

        if (mailbox.bounceCount7d > 5) healthScore -= 30;
        else if (mailbox.bounceCount7d > 2) healthScore -= 15;

        if (mailbox.sentTotal > 50) {
          const replyRate = mailbox.replyCount7d / Math.min(mailbox.sentTotal, 100);
          if (replyRate < 0.01) healthScore -= 10;
        }

        if (status.state !== "connected") healthScore -= 40;

        healthScore = Math.max(0, Math.min(100, healthScore));

        await db
          .update(connectedMailboxes)
          .set({ healthScore, updatedAt: new Date() })
          .where(eq(connectedMailboxes.id, mailboxId));

        if (healthScore < 20 && mailbox.status === "active") {
          await db
            .update(connectedMailboxes)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(connectedMailboxes.id, mailboxId));
          console.warn(`[health] Auto-paused mailbox ${mailbox.emailAddress} (health: ${healthScore})`);
        }

        const lastUpdate = mailbox.updatedAt ? new Date(mailbox.updatedAt) : new Date(0);
        const now = new Date();
        if (lastUpdate.toDateString() !== now.toDateString()) {
          await db
            .update(connectedMailboxes)
            .set({ sentToday: 0, updatedAt: new Date() })
            .where(eq(connectedMailboxes.id, mailboxId));
        }

        console.log(`[health] Mailbox ${mailbox.emailAddress}: score=${healthScore}, state=${status.state}`);
      } catch (err) {
        console.error(`[health] Check failed for ${mailbox.emailAddress}:`, err);
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on("error", (err) => console.error("[health-worker] Error:", err));
  return worker;
}
