/**
 * Warmup scheduler — ramps mailbox sending volume over 21 days
 * Week 1: 5/day → Week 2: 10/day → Week 3: 20/day → Week 4: 50/day
 */

import postgres from "postgres";
import { warmupQueue } from "../queues/index.js";

const sql = postgres(process.env.DATABASE_URL!);

// Ramp schedule: day → daily target
function getDailyTarget(daysSinceStart: number): number {
  if (daysSinceStart < 7) return 5;
  if (daysSinceStart < 14) return 10;
  if (daysSinceStart < 21) return 20;
  return 50;
}

export async function scheduleWarmupEmails() {
  // Find all mailboxes in warming_up status
  const mailboxes = await sql`
    SELECT id, email_address, warmup_started_at, warmup_daily_target, sent_today
    FROM connected_mailboxes
    WHERE status = 'warming_up' AND warmup_started_at IS NOT NULL
  `;

  for (const mailbox of mailboxes) {
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(mailbox.warmup_started_at).getTime()) / 86400000
    );
    const dailyTarget = getDailyTarget(daysSinceStart);

    // Update the daily target in DB
    await sql`
      UPDATE connected_mailboxes SET
        warmup_daily_target = ${dailyTarget},
        updated_at = NOW()
      WHERE id = ${mailbox.id}
    `;

    // Check graduation: 21+ days and target reached 50
    if (daysSinceStart >= 21 && dailyTarget >= 50) {
      await sql`
        UPDATE connected_mailboxes SET
          status = 'active',
          warmup_completed_at = NOW(),
          daily_limit = 50,
          updated_at = NOW()
        WHERE id = ${mailbox.id}
      `;
      console.log(`[warmup-scheduler] Graduated ${mailbox.email_address} to active`);
      continue;
    }

    // Queue warmup emails: how many more to send today
    const remaining = dailyTarget - (mailbox.sent_today || 0);
    if (remaining <= 0) continue;

    // Spread sends across the business hours window (8am-6pm = 10 hours)
    // Add jobs with staggered delays
    for (let i = 0; i < remaining; i++) {
      const delayMs = i * (10 * 3600 * 1000) / remaining; // Spread evenly
      await warmupQueue.add(
        "warmup-send",
        { mailboxId: mailbox.id },
        {
          delay: Math.round(delayMs),
          jobId: `warmup-${mailbox.id}-${new Date().toISOString().split("T")[0]}-${i}`,
        }
      );
    }

    console.log(`[warmup-scheduler] Queued ${remaining} warmup emails for ${mailbox.email_address} (day ${daysSinceStart}, target ${dailyTarget}/day)`);
  }
}
