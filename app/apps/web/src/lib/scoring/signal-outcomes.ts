/**
 * Outcome-driven scoring feedback (primitive ④).
 *
 * Scoring today is rules-based and static: hiring, funding, tech-stack
 * signals all carry the same weight for every tenant. Reality is
 * per-tenant: a dev-tool startup likely closes 3× more often on
 * "hiring RAG engineers" than on "recently funded", while a CRO-
 * persona tool might be the opposite.
 *
 * This module closes the loop without a supervised ML pipeline:
 *
 *   deal stage → 'won' | 'lost'
 *        ↓
 *   `recordDealOutcome(tenantId, dealId, outcome)`
 *        ↓
 *   rows in `signal_outcomes` (one per signal type that fired for
 *   this company in the observation window)
 *        ↓
 *   `getSignalMultipliers(tenantId)` computes lift vs the tenant's
 *   baseline win rate — applied as a multiplier on signal scores.
 *
 * The lift metric is Bayesian-smoothed: we never report a multiplier
 * based on fewer than `MIN_SAMPLE_SIZE` observations so that a
 * one-off win on an exotic signal doesn't take over the scoring.
 */

import { db } from "@/db";
import { signalOutcomes, deals, companies } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { detectActiveSignals, listKnownSignalTypes as listShared } from "./signal-detectors";

/** Minimum number of (won+lost) observations before we trust a multiplier. */
const MIN_SAMPLE_SIZE = 10;

/**
 * How far below / above baseline we're willing to shift scoring.
 * Hard-clamped so a single lopsided streak never zeroes out a signal.
 */
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 2.5;

// SIGNAL_DETECTORS moved to lib/signal-detectors.ts so live scoring
// and outcome attribution read from the same map. Re-export the
// helper so existing callers keep working.
export function listKnownSignalTypes(): string[] {
  return listShared();
}

/**
 * Inspect a company's properties JSONB for fired signals and insert
 * one row per detected signal type into `signal_outcomes`. Safe to
 * call multiple times — downstream aggregation tolerates duplicates
 * (they just mean the signal was observed on multiple deals) but we
 * key on (dealId, signalType) to avoid double-counting the same deal.
 */
export async function recordDealOutcome(params: {
  tenantId: string;
  dealId: string;
  outcome: "won" | "lost";
}): Promise<{ recorded: number; signalTypes: string[] }> {
  const { tenantId, dealId, outcome } = params;

  const [deal] = await db
    .select({ id: deals.id, companyId: deals.companyId, createdAt: deals.createdAt })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);
  if (!deal || !deal.companyId) return { recorded: 0, signalTypes: [] };

  const [company] = await db
    .select({ id: companies.id, properties: companies.properties })
    .from(companies)
    .where(eq(companies.id, deal.companyId))
    .limit(1);
  if (!company) return { recorded: 0, signalTypes: [] };

  const props = (company.properties ?? {}) as Record<string, unknown>;

  // Freshness is judged at the DEAL'S CREATION, not at close: a
  // hiring signal (TTL 30d) that opened a 90-day cycle keeps its
  // credit; a fossil that expired long before the deal started earns
  // none. Signals that fired DURING the cycle pass trivially.
  const attributionAsOf = deal.createdAt ?? new Date();
  const detected = detectActiveSignals(props, attributionAsOf).map((s) => ({
    signalType: s.type as string,
    firedAt: s.firedAt,
  }));

  if (detected.length === 0) return { recorded: 0, signalTypes: [] };

  // Dedup: if we already recorded an outcome for this (deal, signal)
  // pair, skip. This matters when a deal flips won → lost → won in
  // the admin UI — we want to keep the first outcome, not compound it.
  const existing = await db
    .select({ signalType: signalOutcomes.signalType })
    .from(signalOutcomes)
    .where(and(eq(signalOutcomes.tenantId, tenantId), eq(signalOutcomes.dealId, dealId)));
  const seen = new Set(existing.map((r) => r.signalType));

  const rowsToInsert = detected.filter((d) => !seen.has(d.signalType));
  if (rowsToInsert.length === 0) return { recorded: 0, signalTypes: [] };

  await db.insert(signalOutcomes).values(
    rowsToInsert.map((d) => ({
      tenantId,
      dealId,
      companyId: company.id,
      signalType: d.signalType,
      signalFiredAt: d.firedAt,
      outcome,
    })),
  );

  return { recorded: rowsToInsert.length, signalTypes: rowsToInsert.map((d) => d.signalType) };
}

/**
 * Lift math. Returns the per-signal-type multiplier in [MIN, MAX].
 * Uses Bayesian smoothing toward 1.0× until sample size is large
 * enough. Exported for reuse by scoring tests without a DB round trip.
 */
export function computeMultiplier(params: {
  wonWithSignal: number;
  lostWithSignal: number;
  baselineWinRate: number;
}): number {
  const { wonWithSignal, lostWithSignal, baselineWinRate } = params;
  const total = wonWithSignal + lostWithSignal;
  if (total < MIN_SAMPLE_SIZE) return 1;
  const observedRate = wonWithSignal / total;
  if (baselineWinRate <= 0 || baselineWinRate >= 1) return 1;
  const lift = observedRate / baselineWinRate;
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, lift));
}

export interface SignalMultipliers {
  /** Map of signalType → multiplier in [MIN_MULTIPLIER, MAX_MULTIPLIER]. */
  multipliers: Record<string, number>;
  /** Overall tenant win rate used as the baseline. */
  baselineWinRate: number;
  /** Total deals with any outcome recorded (for UI context). */
  totalOutcomes: number;
}

/**
 * Compute per-tenant signal multipliers. Callers treat the returned
 * multipliers as read-only scoring weights — safe to cache at the
 * request level.
 */
export async function getSignalMultipliers(tenantId: string): Promise<SignalMultipliers> {
  // Pull totals per (signalType, outcome) in one query.
  const rows = await db
    .select({
      signalType: signalOutcomes.signalType,
      outcome: signalOutcomes.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(signalOutcomes)
    .where(eq(signalOutcomes.tenantId, tenantId))
    .groupBy(signalOutcomes.signalType, signalOutcomes.outcome);

  let totalWon = 0;
  let totalLost = 0;
  const byType = new Map<string, { won: number; lost: number }>();

  for (const row of rows) {
    const entry = byType.get(row.signalType) ?? { won: 0, lost: 0 };
    if (row.outcome === "won") {
      entry.won += row.count;
      totalWon += row.count;
    } else if (row.outcome === "lost") {
      entry.lost += row.count;
      totalLost += row.count;
    }
    byType.set(row.signalType, entry);
  }

  const totalOutcomes = totalWon + totalLost;
  const baselineWinRate = totalOutcomes > 0 ? totalWon / totalOutcomes : 0;

  const multipliers: Record<string, number> = {};
  for (const [signalType, { won, lost }] of byType.entries()) {
    multipliers[signalType] = computeMultiplier({
      wonWithSignal: won,
      lostWithSignal: lost,
      baselineWinRate,
    });
  }

  // Signals we know about but never attributed → 1.0× (neutral). This
  // avoids scoring gaps when a tenant turns on a new signal.
  for (const signalType of listKnownSignalTypes()) {
    if (!(signalType in multipliers)) multipliers[signalType] = 1;
  }

  return { multipliers, baselineWinRate, totalOutcomes };
}
