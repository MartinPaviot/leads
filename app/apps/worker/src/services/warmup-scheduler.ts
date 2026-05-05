/**
 * Warmup scheduler — ramps mailbox sending volume over 21 days
 * Week 1: 5/day → Week 2: 10/day → Week 3: 20/day → Week 4: 50/day
 */

import { warmupQueue } from "../queues/index.js";
import { db, connectedMailboxes } from "../db.js";
import { eq, and, isNotNull } from "drizzle-orm";

function getDailyTarget(daysSinceStart: number): number {
  if (daysSinceStart < 7) return 5;
  if (daysSinceStart < 14) return 10;
  if (daysSinceStart < 21) return 20;
  return 50;
}

export async function scheduleWarmupEmails() {
  const mailboxes = await db
    .select({
      id: connectedMailboxes.id,
      emailAddress: connectedMailboxes.emailAddress,
      warmupStartedAt: connectedMailboxes.warmupStartedAt,
      warmupDailyTarget: connectedMailboxes.warmupDailyTarget,
      sentToday: connectedMailboxes.sentToday,
    })
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.status, "warming_up"),
        isNotNull(connectedMailboxes.warmupStartedAt)
      )
    );

  for (const mailbox of mailboxes) {
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(mailbox.warmupStartedAt!).getTime()) / 86400000
    );
    const dailyTarget = getDailyTarget(daysSinceStart);

    await db
      .update(connectedMailboxes)
      .set({ warmupDailyTarget: dailyTarget, updatedAt: new Date() })
      .where(eq(connectedMailboxes.id, mailbox.id));

    if (daysSinceStart >= 21 && dailyTarget >= 50) {
      await db
        .update(connectedMailboxes)
        .set({
          status: "active",
          warmupCompletedAt: new Date(),
          dailyLimit: 50,
          updatedAt: new Date(),
        })
        .where(eq(connectedMailboxes.id, mailbox.id));
      console.log(`[warmup-scheduler] Graduated ${mailbox.emailAddress} to active`);
      continue;
    }

    const remaining = dailyTarget - (mailbox.sentToday || 0);
    if (remaining <= 0) continue;

    for (let i = 0; i < remaining; i++) {
      const delayMs = i * (10 * 3600 * 1000) / remaining;
      await warmupQueue.add(
        "warmup-send",
        { mailboxId: mailbox.id },
        {
          delay: Math.round(delayMs),
          jobId: `warmup-${mailbox.id}-${new Date().toISOString().split("T")[0]}-${i}`,
        }
      );
    }

    console.log(`[warmup-scheduler] Queued ${remaining} warmup emails for ${mailbox.emailAddress} (day ${daysSinceStart}, target ${dailyTarget}/day)`);
  }
}
