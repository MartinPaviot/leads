/**
 * Spec 30 — significance primitives. A two-proportion pooled z-test with a
 * two-tailed p-value, used to decide whether a variant's reply/positive rate is
 * really different or just noise. Pure. Blast radius: analytics/ab/* only.
 */

/**
 * Standard normal CDF via the Abramowitz-Stegun approximation (|error| < 7.5e-8).
 * Deterministic; good enough for A/B p-values.
 */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface Proportion {
  conversions: number;
  trials: number;
}

export interface ZTestResult {
  z: number;
  /** Two-tailed p-value. */
  pValue: number;
  rateA: number;
  rateB: number;
}

/** Pooled two-proportion z-test. A zero standard error (degenerate input) → z=0, p=1. */
export function twoProportionZTest(a: Proportion, b: Proportion): ZTestResult {
  const rateA = a.trials > 0 ? a.conversions / a.trials : 0;
  const rateB = b.trials > 0 ? b.conversions / b.trials : 0;
  if (a.trials === 0 || b.trials === 0) return { z: 0, pValue: 1, rateA, rateB };

  const pPool = (a.conversions + b.conversions) / (a.trials + b.trials);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.trials + 1 / b.trials));
  const z = se > 0 ? (rateA - rateB) / se : 0;
  // Clamp to [0,1]: the normal-CDF approximation can drift a hair past 1 at z≈0.
  const pValue = se > 0 ? Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z))))) : 1;
  return { z, pValue, rateA, rateB };
}
