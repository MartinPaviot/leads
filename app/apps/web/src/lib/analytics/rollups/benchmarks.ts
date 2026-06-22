/**
 * Spec 29 (AC2) — methodology M7 benchmark baselines (the SSOT; no methodology.md
 * exists in-repo, so these named constants are the single place the M7 numbers
 * live). Each rolled-up metric is compared and flagged above/below.
 */

export interface Benchmarks {
  deliveryRate: number;
  replyRate: number;
  positiveRate: number;
  /** Upper bounds — being BELOW these is good. */
  bounceRate: number;
  spamRate: number;
}

/** Realistic 2026 cold-outbound baselines. */
export const DEFAULT_BENCHMARKS: Benchmarks = {
  deliveryRate: 0.97,
  replyRate: 0.05,
  positiveRate: 0.01,
  bounceRate: 0.02,
  spamRate: 0.001,
};

/** Whether higher is better for a metric (false → a ceiling, lower is better). */
const HIGHER_IS_BETTER: Record<keyof Benchmarks, boolean> = {
  deliveryRate: true,
  replyRate: true,
  positiveRate: true,
  bounceRate: false,
  spamRate: false,
};

export type BenchmarkFlag = "above" | "below" | "on_target";

export interface BenchmarkComparison {
  metric: keyof Benchmarks;
  value: number;
  benchmark: number;
  flag: BenchmarkFlag;
  /** True when the flag is the GOOD direction for this metric. */
  healthy: boolean;
}

/** Compare a metric to its benchmark, flagging above/below and whether that's healthy. */
export function compareMetric(metric: keyof Benchmarks, value: number, benchmarks: Benchmarks = DEFAULT_BENCHMARKS): BenchmarkComparison {
  const benchmark = benchmarks[metric];
  const flag: BenchmarkFlag = value > benchmark ? "above" : value < benchmark ? "below" : "on_target";
  const higherBetter = HIGHER_IS_BETTER[metric];
  const healthy = flag === "on_target" || (higherBetter ? flag === "above" : flag === "below");
  return { metric, value, benchmark, flag, healthy };
}
