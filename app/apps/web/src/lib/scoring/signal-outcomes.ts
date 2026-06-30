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
import { filterFreshSignals } from "@/lib/signals/freshness";
import type { SignalEntry } from "@/lib/signals/record-signal";

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
 * Informed PRIOR multipliers — the default lift for a signal type BEFORE the
 * tenant has ≥ MIN_SAMPLE_SIZE attributed outcomes. Without these, a fresh
 * buying signal sits at neutral 1.0 (no lift) until ~10 deals close — useless
 * for a young tenant or a freshly-sourced cold TAM, and contradicts the premise
 * that the score is primarily a resultant of SIGNALS. The prior is a starting
 * belief that real outcome data OVERRIDES once it exists (Bayesian prior →
 * posterior). Clamped to [MIN_MULTIPLIER, MAX_MULTIPLIER]; types absent here
 * default to 1.0 (truly neutral).
 */
export const SIGNAL_PRIORS: Record<string, number> = {
  // Engagement — the strongest signals: the prospect responded.
  positive_reply: 2.5,
  meeting_booked: 2.5,
  linkedin_reply: 2.3,
  email_clicked: 1.4,
  email_opened: 1.15,
  // Warm-network proximity — a 1st-degree path is a real, actionable edge.
  warm_connection: 1.8,
  linkedin_accept: 1.6,
  // Intent / firmographic buying signals (known lift; refined by outcomes).
  demo_request: 2.2,
  funding_recent: 1.6,
  funding: 1.5,
  funding_crunchbase: 1.5,
  // Continuous Signal Monitor (inngest/signal-monitor.ts) writes these from
  // news/job feeds straight into properties.signals[]. Without a prior here
  // they were `undefined` in the multiplier table → floored to a dead 1.0× on
  // the daily priority score AND never cleared KAIROS_WEIGHT_THRESHOLD, so the
  // cadence accelerator ignored them too. Ordered: a raise/M&A outranks a
  // hiring surge outranks a single exec hire.
  acquisition: 1.6,
  hiring_surge: 1.5,
  executive_hire: 1.4,
  investor_overlap: 1.4,
  hiring: 1.4,
  hiring_intent: 1.4,
  website_visit: 1.3,
  page_visit: 1.3,
  headcount_growth: 1.3,
  leadership_change: 1.3,
  tech_stack_change: 1.3,
  tech_adoption: 1.3,
};

/** The prior for a type, clamped to the multiplier band. 1.0 when none. */
export function priorMultiplier(signalType: string): number {
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, SIGNAL_PRIORS[signalType] ?? 1));
}

/**
 * Producer-side signal aliases → their canonical learned-outcome family.
 *
 * The detectors / outcome attribution key funding outcomes as `funding`
 * (lib/scoring/signal-detectors.ts), but `funding-signal-monitor` writes a
 * FRESH raise as `funding_recent` into `properties.signals[]` (the array the
 * daily scorer reads — lib/signals/record-signal.ts). Without this map a
 * tenant's LEARNED funding lift would never reach a `funding_recent` signal:
 * the multiplier table has no `funding_recent` outcome key, so it sits on the
 * static prior forever, defeating the whole point of the outcome loop.
 *
 * `funding_recent`→`funding`, `hiring_surge`→`hiring`, `executive_hire`→
 * `leadership_change`: each producer variant is the same underlying event as a
 * detector type that DOES accrue outcomes, so it should ride the learned lift
 * once one exists.
 *
 * `acquisition` and `warm_connection` are intentionally ABSENT: neither has a
 * detector counterpart (no won/lost is ever attributed to them), so they always
 * — and correctly — ride their prior.
 */
export const SIGNAL_CANONICAL_ALIAS: Record<string, string> = {
  funding_recent: "funding",
  hiring_surge: "hiring",
  executive_hire: "leadership_change",
};

/**
 * Pure: let producer aliases inherit their canonical family's LEARNED multiplier
 * — but only when it was actually learned (the canonical type cleared
 * MIN_SAMPLE_SIZE). Below the threshold the alias keeps its own informed prior:
 * a "recent" raise is a stronger prior than a generic one, and we only ever
 * override a prior with real data, never with another prior. Mutates + returns.
 */
export function inheritAliasMultipliers(
  multipliers: Record<string, number>,
  learnedTypes: ReadonlySet<string>,
): Record<string, number> {
  for (const [alias, canonical] of Object.entries(SIGNAL_CANONICAL_ALIAS)) {
    if (learnedTypes.has(canonical) && canonical in multipliers) {
      multipliers[alias] = multipliers[canonical];
    }
  }
  return multipliers;
}

/**
 * Attribute the engagement / producer signals that live in
 * `companies.properties.signals[]` (the array recordCompanySignal writes:
 * positive_reply, meeting_booked, email_opened/clicked, demo_request,
 * warm_connection, funding_recent, ...). The structured detectors only
 * read first-class subtrees, so without this these types never accrue a
 * won/lost outcome and ride their static prior forever. Freshness is
 * judged at `asOf` (the deal's creation) exactly like the structured
 * path; the type is canonicalized so an alias rides its learned family.
 * Pure — exported for tests.
 */
export function detectArraySignals(
  props: Record<string, unknown>,
  asOf: Date,
): Array<{ signalType: string; firedAt: Date }> {
  // Pre-filter malformed entries: filterFreshSignals → normalizeType calls
  // `.trim()`, which throws on a type-less entry. Real data always has a
  // type, but stay defensive.
  const arr = (Array.isArray(props.signals) ? (props.signals as SignalEntry[]) : []).filter(
    (s) => s && typeof s.type === "string" && s.type.length > 0,
  );
  const out: Array<{ signalType: string; firedAt: Date }> = [];
  for (const s of filterFreshSignals(arr, asOf)) {
    if (!s.detectedAt) continue;
    const firedAt = new Date(s.detectedAt);
    if (Number.isNaN(firedAt.getTime())) continue; // unparseable → can't attribute
    out.push({ signalType: SIGNAL_CANONICAL_ALIAS[s.type] ?? s.type, firedAt });
  }
  return out;
}

/** Dedup detected signals by canonical type, keeping the first seen. Pure. */
export function dedupeBySignalType(
  rows: Array<{ signalType: string; firedAt: Date }>,
): Array<{ signalType: string; firedAt: Date }> {
  const byType = new Map<string, { signalType: string; firedAt: Date }>();
  for (const r of rows) {
    if (!byType.has(r.signalType)) byType.set(r.signalType, r);
  }
  return [...byType.values()];
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
  const structured = detectActiveSignals(props, attributionAsOf).map((s) => ({
    signalType: s.type as string,
    firedAt: s.firedAt,
  }));

  // Union the structured detections with the engagement/producer signals
  // that live in properties.signals[] (dedup by canonical type) so types
  // like positive_reply / meeting_booked finally accrue outcomes instead
  // of riding their static prior.
  const detected = dedupeBySignalType([
    ...structured,
    ...detectArraySignals(props, attributionAsOf),
  ]);

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
  const learnedTypes = new Set<string>();
  for (const [signalType, { won, lost }] of byType.entries()) {
    // Enough attributed outcomes → trust the computed lift; otherwise fall
    // back to the informed prior (not flat 1.0) so the signal still lifts.
    const learned = won + lost >= MIN_SAMPLE_SIZE;
    if (learned) learnedTypes.add(signalType);
    multipliers[signalType] = learned
      ? computeMultiplier({ wonWithSignal: won, lostWithSignal: lost, baselineWinRate })
      : priorMultiplier(signalType);
  }

  // Signals we know about but never attributed → their informed PRIOR (not
  // flat 1.0), so a fresh signal lifts before any deal has closed. Cover both
  // the detector types and every type with a defined prior.
  for (const signalType of [...listKnownSignalTypes(), ...Object.keys(SIGNAL_PRIORS)]) {
    if (!(signalType in multipliers)) multipliers[signalType] = priorMultiplier(signalType);
  }

  // Producer aliases (funding_recent) inherit the canonical family's LEARNED
  // lift so the outcome loop reaches the variant the monitors actually write.
  inheritAliasMultipliers(multipliers, learnedTypes);

  return { multipliers, baselineWinRate, totalOutcomes };
}
