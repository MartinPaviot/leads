/**
 * Per-tenant monthly voice usage cap.
 *
 * 4000 minutes/month/seat are included in the $999/mo plan; overage is
 * billed at $0.05/min via Stripe (Phase 4 wires it). For Phase 1 we
 * track usage and soft-cap at 4000 × seat_count with a hard ceiling
 * of 1.5× that to prevent runaway bills if a script goes haywire.
 */

import { db } from "@/db";
import { voiceUsageMonthly, users } from "@/db/schema";
import { and, eq, count, sql } from "drizzle-orm";

const MIN_INCLUDED_PER_SEAT = 4000;
const HARD_CEILING_MULTIPLIER = 1.5;

function currentYearMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

export interface UsageStatus {
  yearMonth: string;
  minutesUsed: number;
  minutesIncluded: number;
  hardCeiling: number;
  capReached: boolean;
  hardCeilingReached: boolean;
}

export async function getTenantUsage(
  tenantId: string,
  now = new Date(),
): Promise<UsageStatus> {
  const yearMonth = currentYearMonth(now);

  const seatRows = await db
    .select({ c: count() })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const seats = Number(seatRows[0]?.c ?? 1);

  const usage = await db
    .select({ minutesUsed: voiceUsageMonthly.minutesUsed })
    .from(voiceUsageMonthly)
    .where(
      and(
        eq(voiceUsageMonthly.tenantId, tenantId),
        eq(voiceUsageMonthly.yearMonth, yearMonth),
      ),
    )
    .limit(1);

  const minutesUsed = usage.length > 0 ? usage[0].minutesUsed : 0;
  const minutesIncluded = seats * MIN_INCLUDED_PER_SEAT;
  const hardCeiling = Math.floor(minutesIncluded * HARD_CEILING_MULTIPLIER);

  return {
    yearMonth,
    minutesUsed,
    minutesIncluded,
    hardCeiling,
    capReached: minutesUsed >= minutesIncluded,
    hardCeilingReached: minutesUsed >= hardCeiling,
  };
}

export async function recordCallMinutes(
  tenantId: string,
  durationSec: number,
  connected: boolean,
  now = new Date(),
): Promise<void> {
  const yearMonth = currentYearMonth(now);
  const minutes = Math.ceil(durationSec / 60);

  // Upsert — Drizzle's onConflictDoUpdate handles the increment in a
  // single round-trip.
  await db
    .insert(voiceUsageMonthly)
    .values({
      tenantId,
      yearMonth,
      minutesUsed: minutes,
      callsAttempted: 1,
      callsConnected: connected ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [voiceUsageMonthly.tenantId, voiceUsageMonthly.yearMonth],
      set: {
        minutesUsed: sql`${voiceUsageMonthly.minutesUsed} + ${minutes}`,
        callsAttempted: sql`${voiceUsageMonthly.callsAttempted} + 1`,
        callsConnected: sql`${voiceUsageMonthly.callsConnected} + ${connected ? 1 : 0}`,
        updatedAt: new Date(),
      },
    });
}
