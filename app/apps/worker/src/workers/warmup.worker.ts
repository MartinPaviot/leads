import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import { sendEmail } from "../services/emailengine.js";
import { db, connectedMailboxes, warmupEmails } from "../db.js";
import { eq, and, ne, sql } from "drizzle-orm";

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

      const [mailbox] = await db
        .select()
        .from(connectedMailboxes)
        .where(
          and(
            eq(connectedMailboxes.id, mailboxId),
            eq(connectedMailboxes.status, "warming_up")
          )
        );
      if (!mailbox) return;

      const [target] = await db
        .select()
        .from(connectedMailboxes)
        .where(
          and(
            ne(connectedMailboxes.id, mailboxId),
            sql`${connectedMailboxes.status} IN ('warming_up', 'active')`
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);

      if (!target) {
        console.log(`[warmup] No target mailbox found for ${mailbox.emailAddress}`);
        return;
      }

      const subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      const body = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

      try {
        const result = await sendEmail(mailbox.eeAccountId, {
          from: { name: mailbox.displayName || "", address: mailbox.emailAddress },
          to: [{ address: target.emailAddress }],
          subject,
          html: `<p>${body}</p>`,
        });

        await db.insert(warmupEmails).values({
          mailboxId,
          targetMailboxId: target.id,
          direction: "sent",
          messageId: result.messageId,
          status: "sent",
        });

        await db
          .update(connectedMailboxes)
          .set({
            sentToday: sql`${connectedMailboxes.sentToday} + 1`,
            sentTotal: sql`${connectedMailboxes.sentTotal} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(connectedMailboxes.id, mailboxId));

        console.log(`[warmup] Sent from ${mailbox.emailAddress} to ${target.emailAddress}`);

        const daysSinceStart = mailbox.warmupStartedAt
          ? Math.floor((Date.now() - new Date(mailbox.warmupStartedAt).getTime()) / 86400000)
          : 0;

        if (daysSinceStart >= 21 && (mailbox.warmupDailyTarget || 0) >= 50) {
          await db
            .update(connectedMailboxes)
            .set({
              status: "active",
              warmupCompletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(connectedMailboxes.id, mailboxId));
          console.log(`[warmup] Mailbox ${mailbox.emailAddress} graduated to active!`);
        }
      } catch (err) {
        console.error(`[warmup] Failed for ${mailbox.emailAddress}:`, err);
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on("error", (err) => console.error("[warmup-worker] Error:", err));
  return worker;
}
