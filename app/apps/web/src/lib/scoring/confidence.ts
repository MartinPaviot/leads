/**
 * Score confidence — how evidenced a grade is. _specs/propensity-scoring, A4.
 *
 * confidence = coverage × freshnessFactor
 *   - coverage: share of scorable criteria we actually had data for (already
 *     computed by computeBlendedFit) — flags THIN data.
 *   - freshnessFactor: exponential decay on the STALEST relevant input date
 *     (a score is only as fresh as its oldest input) — flags STALE data.
 *
 * The point: a high grade built on thin or stale data must never silently
 * outrank a well-evidenced one. Lists sort by score × confidence. Missing dates
 * do NOT penalise freshness (absence of a date ≠ proof of staleness — same
 * doctrine as signal freshness), so thin-but-undated data is flagged by coverage
 * alone. Pure, no I/O.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HALF_LIFE_DAYS = 180;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export interface ConfidenceInput {
  /** Share of scorable criteria evaluable, [0,1] (from computeBlendedFit). */
  coverage: number;
  /** Relevant input dates (role verified-at, signal fired-at, last enriched-at). */
  dataDates?: Array<Date | string | null | undefined>;
  now?: Date;
  /** Days for the freshness to halve (default 180). */
  halfLifeDays?: number;
}

export interface ConfidenceResult {
  confidence: number;
  freshnessFactor: number;
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const now = input.now ?? new Date();
  const halfLife = input.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const coverage = clamp01(input.coverage);

  const ages = (input.dataDates ?? [])
    .map(toDate)
    .filter((d): d is Date => d !== null)
    .map((d) => Math.max(0, (now.getTime() - d.getTime()) / DAY_MS));

  // Stalest input is the bottleneck; no dates → don't penalise (1.0).
  const freshnessFactor = ages.length > 0 ? Math.pow(0.5, Math.max(...ages) / halfLife) : 1;

  return { confidence: clamp01(coverage * freshnessFactor), freshnessFactor };
}
