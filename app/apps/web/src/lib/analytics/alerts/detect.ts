/**
 * Spec 32 — regression detection. Direction-aware significant negative deltas
 * against a trailing baseline. reply/positive regress when they DROP; bounce/spam
 * regress when they RISE. A deliverability regression routes to the guard (27); a
 * content/targeting one surfaces to the weekly agent (31). Pure. Blast radius:
 * analytics/alerts/* only.
 */

export type MetricKey = "replyRate" | "positiveRate" | "bounceRate" | "spamRate";
export const METRIC_KEYS: readonly MetricKey[] = ["replyRate", "positiveRate", "bounceRate", "spamRate"];

/** Higher-is-better metrics regress on a drop; the rest regress on a rise. */
const HIGHER_IS_BETTER: Record<MetricKey, boolean> = {
  replyRate: true,
  positiveRate: true,
  bounceRate: false,
  spamRate: false,
};

export type RegressionCause = "deliverability" | "content";
export type RegressionRoute = "guard" | "weekly";

export interface MetricSnapshot {
  scope: string;
  current: Partial<Record<MetricKey, number>>;
  /** Trailing baseline to compare against. */
  baseline: Partial<Record<MetricKey, number>>;
}

export interface Regression {
  scope: string;
  metric: MetricKey;
  current: number;
  baseline: number;
  /** Relative magnitude of the regression (0.3 = 30% worse). */
  magnitude: number;
  cause: RegressionCause;
  route: RegressionRoute;
}

export interface DetectConfig {
  /** Relative change at/above which a delta is a regression (default 0.3 = 30% worse). */
  threshold?: number;
  /** Ignore metrics whose baseline is below this (too small to be meaningful). */
  minBaseline?: number;
}

const DEFAULT_THRESHOLD = 0.3;

function causeOf(metric: MetricKey): RegressionCause {
  return metric === "bounceRate" || metric === "spamRate" ? "deliverability" : "content";
}

/** AC1/AC4 — regressions in the snapshot, each routed by cause. */
export function detectRegressions(snapshot: MetricSnapshot, config: DetectConfig = {}): Regression[] {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const minBaseline = config.minBaseline ?? 0;
  const out: Regression[] = [];

  for (const metric of METRIC_KEYS) {
    const current = snapshot.current[metric];
    const baseline = snapshot.baseline[metric];
    if (current === undefined || baseline === undefined) continue;
    if (baseline < minBaseline) continue;

    const higherBetter = HIGHER_IS_BETTER[metric];
    const worse = higherBetter ? current < baseline : current > baseline;
    if (!worse) continue;

    const denom = Math.max(Math.abs(baseline), 1e-9);
    const magnitude = Math.abs(current - baseline) / denom;
    if (magnitude < threshold) continue;

    const cause = causeOf(metric);
    out.push({ scope: snapshot.scope, metric, current, baseline, magnitude, cause, route: cause === "deliverability" ? "guard" : "weekly" });
  }
  return out;
}
