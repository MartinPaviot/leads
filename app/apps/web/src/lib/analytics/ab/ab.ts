/**
 * Spec 30 — A/B significance verdicts. Judges whether a variant comparison is a
 * real winner before one is promoted. Refuses to call noise a winner: a verdict
 * requires a minimum sample, the significance threshold, and a single declared
 * axis. Pure function of the metrics snapshot. Blast radius: analytics/ab/* only.
 */

import { twoProportionZTest } from "./significance";

export type AbMetric = "reply" | "positive";

export interface AbVariant {
  variantId: string;
  /** The single axis the set varies (spec 20). */
  axis: string;
  axisValue: string;
  sent: number;
  replies: number;
  positiveReplies: number;
}

export type AbVerdict = "insufficient_data" | "no_significant_difference" | "winner" | "inconclusive";

export interface AbComparison {
  a: string;
  b: string;
  rateA: number;
  rateB: number;
}

export interface AbResult {
  verdict: AbVerdict;
  metric: AbMetric;
  winnerId?: string;
  pValue?: number;
  reason?: string;
  comparison?: AbComparison;
}

/** Minimum sends per compared variant before any verdict (AC2). */
export const DEFAULT_MIN_SAMPLE = 100;
/** Significance threshold (AC3). */
export const DEFAULT_ALPHA = 0.05;

export interface AbOptions {
  metric?: AbMetric;
  minSample?: number;
  alpha?: number;
}

function conversions(v: AbVariant, metric: AbMetric): number {
  return metric === "positive" ? v.positiveReplies : v.replies;
}

/**
 * Evaluate an A/B test over a one-axis variant set. Returns insufficient_data /
 * no_significant_difference / winner / inconclusive — never a winner on a
 * null or under-sampled dataset.
 */
export function evaluateAbTest(variants: AbVariant[], opts: AbOptions = {}): AbResult {
  const metric = opts.metric ?? "reply";
  const minSample = opts.minSample ?? DEFAULT_MIN_SAMPLE;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;

  if (variants.length < 2) {
    return { verdict: "inconclusive", metric, reason: "need at least two variants" };
  }

  // AC4 — all variants must share one declared axis.
  const axes = new Set(variants.map((v) => v.axis));
  if (axes.size > 1) {
    return { verdict: "inconclusive", metric, reason: `mixed axes: ${[...axes].join(", ")}` };
  }

  // Compare the two highest-rate variants.
  const ranked = [...variants].sort((x, y) => {
    const rx = x.sent > 0 ? conversions(x, metric) / x.sent : 0;
    const ry = y.sent > 0 ? conversions(y, metric) / y.sent : 0;
    return ry - rx || x.variantId.localeCompare(y.variantId);
  });
  const [a, b] = ranked;

  // AC2 — minimum sample on both compared variants, else no verdict.
  if (a.sent < minSample || b.sent < minSample) {
    return { verdict: "insufficient_data", metric, reason: `need >= ${minSample} sends per variant`, comparison: comparison(a, b, metric) };
  }

  const test = twoProportionZTest(
    { conversions: conversions(a, metric), trials: a.sent },
    { conversions: conversions(b, metric), trials: b.sent },
  );

  // AC3 — winner only when significant; else no significant difference.
  if (test.pValue < alpha && test.rateA !== test.rateB) {
    const winner = test.rateA >= test.rateB ? a : b;
    return { verdict: "winner", metric, winnerId: winner.variantId, pValue: test.pValue, comparison: comparison(a, b, metric) };
  }
  return { verdict: "no_significant_difference", metric, pValue: test.pValue, comparison: comparison(a, b, metric) };
}

function comparison(a: AbVariant, b: AbVariant, metric: AbMetric): AbComparison {
  return {
    a: a.variantId,
    b: b.variantId,
    rateA: a.sent > 0 ? conversions(a, metric) / a.sent : 0,
    rateB: b.sent > 0 ? conversions(b, metric) / b.sent : 0,
  };
}
