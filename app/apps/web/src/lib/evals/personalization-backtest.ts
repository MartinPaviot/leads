/**
 * P1-12 (Fix 5 / R12–R16) — nightly reply-rate back-test of the quality score.
 *
 * For each tenant with scored sends in the window, bucket the sent emails by the
 * quality composite, measure the reply rate per bucket, and compute the
 * point-biserial correlation between composite (continuous) and replied (binary).
 * If the score predicts replies, correlation is positive and reply-rate rises
 * across buckets — that's the signal the cockpit surfaces to justify the gate.
 *
 * The stat core (`computeBacktest`, `pointBiserial`) is pure and unit-tested
 * without a DB. `backtestTenant` / `listTenantsWithScoredEmails` are the thin IO
 * shells. NO LLM calls — pure SQL + arithmetic. Aggregates only, no email bodies.
 */

import { db } from "@/db";
import { outboundEmails, personalizationCalibration } from "@/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { compositeFromColumn } from "./quality-score-column";

export interface BacktestRow {
  composite: number;
  replied: boolean;
}

export interface BacktestBucket {
  tier: string;
  n: number;
  replied: number;
  replyRate: number;
}

export interface BacktestResult {
  buckets: BacktestBucket[];
  correlation: number | null;
  insufficientData: boolean;
  totalScored: number;
  windowDays: number;
}

/** Quality tiers (R13). Bounds are [lo, hi): exactly 0.5 → "0.5-0.7" (edge 11). */
const TIERS: ReadonlyArray<{ tier: string; lo: number; hi: number }> = [
  { tier: "<0.5", lo: -Infinity, hi: 0.5 },
  { tier: "0.5-0.7", lo: 0.5, hi: 0.7 },
  { tier: "0.7-0.9", lo: 0.7, hi: 0.9 },
  { tier: ">=0.9", lo: 0.9, hi: Infinity },
];

/** Below this many scored sends, the correlation isn't trustworthy (R15). */
export const MIN_SAMPLE = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Point-biserial correlation between a continuous score and a binary outcome.
 * Mathematically identical to Pearson's r with the binary coded 0/1. Returns
 * null when either variable has zero variance (all same score, or all/none
 * replied) — a correlation is undefined there, not zero.
 */
export function pointBiserial(rows: BacktestRow[]): number | null {
  const n = rows.length;
  if (n < 2) return null;
  const xs = rows.map((r) => r.composite);
  const ys = rows.map((r) => (r.replied ? 1 : 0));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  // Epsilon (not === 0): summing identical values then dividing leaves a tiny
  // rounding residue, so a truly variance-free column reads as ~1e-30, not 0.
  const EPS = 1e-12;
  if (vx <= EPS || vy <= EPS) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Pure stat core — bucket rows, compute reply rates + correlation (R13–R15). */
export function computeBacktest(rows: BacktestRow[], windowDays: number): BacktestResult {
  const totalScored = rows.length;
  const buckets: BacktestBucket[] = TIERS.map(({ tier, lo, hi }) => {
    const inTier = rows.filter((r) => r.composite >= lo && r.composite < hi);
    const replied = inTier.filter((r) => r.replied).length;
    return {
      tier,
      n: inTier.length,
      replied,
      replyRate: inTier.length ? replied / inTier.length : 0,
    };
  });
  const insufficientData = totalScored < MIN_SAMPLE;
  const correlation = insufficientData ? null : pointBiserial(rows);
  return { buckets, correlation, insufficientData, totalScored, windowDays };
}

/** YYYY-MM-DD for the `date` run_date column (idempotence key, R16). */
function toRunDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Back-test one tenant and UPSERT a calibration row keyed on (tenant, run_date)
 * — idempotent (R16). `now` is injectable so tests pin the window + run_date.
 * Tenant-scoped on every read (edge 15).
 */
export async function backtestTenant(
  tenantId: string,
  windowDays = 90,
  now: Date = new Date(),
): Promise<BacktestResult> {
  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);

  const rows = await db
    .select({ qualityScore: outboundEmails.qualityScore, repliedAt: outboundEmails.repliedAt })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        isNotNull(outboundEmails.qualityScore),
        gte(outboundEmails.sentAt, since),
      ),
    );

  const parsed: BacktestRow[] = [];
  for (const r of rows) {
    const composite = compositeFromColumn(r.qualityScore);
    if (composite == null) continue; // ungradeable jsonb → skip (edge 14)
    parsed.push({ composite, replied: r.repliedAt != null });
  }

  const result = computeBacktest(parsed, windowDays);
  const runDate = toRunDate(now);

  await db
    .insert(personalizationCalibration)
    .values({
      tenantId,
      runAt: now,
      runDate,
      windowDays,
      buckets: result.buckets,
      correlation: result.correlation,
      insufficientData: result.insufficientData,
      totalScored: result.totalScored,
    })
    .onConflictDoUpdate({
      target: [personalizationCalibration.tenantId, personalizationCalibration.runDate],
      set: {
        runAt: now,
        windowDays,
        buckets: result.buckets,
        correlation: result.correlation,
        insufficientData: result.insufficientData,
        totalScored: result.totalScored,
      },
    });

  return result;
}

/** Tenants with at least one scored send in the window — the cron's work-list. */
export async function listTenantsWithScoredEmails(
  windowDays = 90,
  now: Date = new Date(),
): Promise<string[]> {
  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const rows = await db
    .selectDistinct({ tenantId: outboundEmails.tenantId })
    .from(outboundEmails)
    .where(and(isNotNull(outboundEmails.qualityScore), gte(outboundEmails.sentAt, since)));
  return rows.map((r) => r.tenantId);
}
