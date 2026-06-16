/**
 * Propensity blend — the RANK inside an ICP (_specs/propensity-scoring B2).
 *
 * ICP fit is the GATE (in/out, saturates inside the ICP). Propensity grades the
 * members by their predicted pull-toward-an-outcome, blending dimensions that
 * are ORTHOGONAL to ICP membership:
 *   depth  — how well the firmographics fit (graded, not binary)  [computeDepth]
 *   intent — fresh buying-signal strength above baseline          [signal-outcomes]
 *   reach  — can we actually act (accessibility + warm path)
 *   value  — economic potential of the deal
 *   (pain  — specific-problem match, Phase C, optional)
 * minus negative-signal penalties. Pure: weights are passed in (learned per
 * tenant in B3); a missing component is renormalised out, never zeroes the blend.
 */

export interface PropensityComponents {
  depth: number;
  intent: number;
  reach: number;
  value: number;
  /** Phase C — optional; absent ⇒ renormalised out, not penalised. */
  pain?: number;
}

export interface PropensityWeights {
  depth: number;
  intent: number;
  reach: number;
  value: number;
  pain?: number;
}

/** Sensible priors until B3 learns per-tenant weights from outcomes. */
export const DEFAULT_PROPENSITY_WEIGHTS: PropensityWeights = {
  depth: 0.3,
  intent: 0.3,
  reach: 0.2,
  value: 0.2,
};

const COMPONENT_KEYS: ReadonlyArray<keyof PropensityComponents> = [
  "depth",
  "intent",
  "reach",
  "value",
  "pain",
];

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Weighted average over the PRESENT components, minus penalties, clamped to
 * [0,1]. Weighted-average (not sum) so an absent component (e.g. pain) is
 * renormalised out rather than dragging the score to zero. Monotonic in each
 * component; penalties only ever subtract.
 */
export function computePropensity(
  components: PropensityComponents,
  weights: PropensityWeights = DEFAULT_PROPENSITY_WEIGHTS,
  penalties = 0,
): number {
  let wSum = 0;
  let acc = 0;
  for (const k of COMPONENT_KEYS) {
    const c = components[k];
    const w = weights[k];
    if (typeof c === "number" && typeof w === "number" && w > 0) {
      acc += w * clamp01(c);
      wSum += w;
    }
  }
  const base = wSum > 0 ? acc / wSum : 0;
  return clamp01(base - Math.max(0, penalties));
}

/**
 * Economic-value band in [0,1] from size (or revenue) — bigger = more deal
 * potential, log-scaled with diminishing returns and capped. Within an ICP that
 * already bounds size, this still separates a 900-FTE account from a 120-FTE one.
 */
export function valueBand(input: { employeeCount?: number | null; revenue?: number | null }): number {
  const emp = typeof input.employeeCount === "number" && input.employeeCount > 0 ? input.employeeCount : null;
  const rev = typeof input.revenue === "number" && input.revenue > 0 ? input.revenue : null;
  if (emp !== null) {
    // 10 → 0.33, 100 → 0.66, 1000+ → 1.0
    return clamp01(Math.log10(emp) / 3);
  }
  if (rev !== null) {
    // 100k → 0.5, 10M → 0.83, 1B+ → 1.0 (log10 over [1e3, 1e9])
    return clamp01((Math.log10(rev) - 3) / 6);
  }
  return 0;
}

/**
 * Normalise a signal lift multiplier ([0.5, 2.5] from signal-outcomes) into an
 * intent component [0,1]: baseline (1.0×) → 0 (no positive intent), max (2.5×)
 * → 1.0. Sub-baseline signals contribute 0 (never negative intent).
 */
export function normalizeIntent(multiplier: number): number {
  if (!Number.isFinite(multiplier)) return 0;
  return clamp01((multiplier - 1) / 1.5);
}
