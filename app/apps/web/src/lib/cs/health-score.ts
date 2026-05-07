/**
 * Composite account health scoring (Sprint-2 audit follow-up).
 *
 * Pure function — receives a `HealthInputs` and returns a 0-100
 * composite + per-axis breakdown + risk classification + an
 * AI-generation-ready hint about what to do next. The cron in
 * `inngest/cs-health-cron.ts` collects the raw inputs from Postgres
 * and calls this for every active account daily.
 *
 * The 5 axes mirror what a Founding CS at Monaco would weigh :
 *   - usage      — recent product activity (logins, page hits, API calls)
 *   - sentiment  — last 30d email/meeting sentiment trend
 *   - engagement — frequency of two-way contact (replies, meetings)
 *   - velocity   — deal velocity vs the tenant's median
 *   - support    — open support / objection ticket count (lower is better)
 *
 * All inputs are 0-100 scaled by the caller — keeps the function
 * pure-numeric, testable, no DB. Weights are tuned conservatively :
 * sentiment + engagement are the strongest leading indicators of
 * churn per public CS research (e.g. Gainsight studies); usage is
 * the strongest of expansion intent.
 */

export interface HealthInputs {
  /** 0-100, higher = more product activity. */
  usage: number;
  /** 0-100, higher = more positive sentiment. */
  sentiment: number;
  /** 0-100, higher = more two-way contact. */
  engagement: number;
  /** 0-100, higher = faster deal progression. */
  velocity: number;
  /** 0-100, higher = fewer open issues / objections. */
  support: number;
}

export interface HealthBreakdown extends HealthInputs {}

export type RiskLevel = "high" | "medium" | "low" | "thriving";

export interface HealthScoreResult {
  /** 0-100 composite, integer. */
  score: number;
  components: HealthBreakdown;
  riskLevel: RiskLevel;
  /** Top 1-2 weakest axes — caller uses for "next action" generation. */
  weakestAxes: Array<keyof HealthInputs>;
}

const WEIGHTS: Record<keyof HealthInputs, number> = {
  usage: 0.20,
  sentiment: 0.25,
  engagement: 0.25,
  velocity: 0.20,
  support: 0.10,
};

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Normalize and clamp every input axis to 0..100 before scoring. */
function normalize(inputs: HealthInputs): HealthInputs {
  return {
    usage: clamp(inputs.usage, 0, 100),
    sentiment: clamp(inputs.sentiment, 0, 100),
    engagement: clamp(inputs.engagement, 0, 100),
    velocity: clamp(inputs.velocity, 0, 100),
    support: clamp(inputs.support, 0, 100),
  };
}

/**
 * Risk thresholds — tuned so that the daily queue at /cs/today is
 * actionably small. A 100-account TAM with the median tenant should
 * yield 5-10 "high" or "medium" entries per day (manageable), not
 * 40 (overwhelming).
 */
function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "thriving";
  if (score >= 60) return "low";
  if (score >= 40) return "medium";
  return "high";
}

/**
 * Compute composite 0-100 health score with per-axis breakdown.
 * Returns the weakest two axes so a downstream LLM call can phrase
 * "we noticed sentiment dropped + engagement is thin → recommend X"
 * without re-deriving from the score.
 */
export function computeHealthScore(rawInputs: HealthInputs): HealthScoreResult {
  const components = normalize(rawInputs);

  // Weighted sum then round to integer for storage / display.
  let raw = 0;
  for (const k of Object.keys(WEIGHTS) as Array<keyof HealthInputs>) {
    raw += components[k] * WEIGHTS[k];
  }
  const score = Math.round(clamp(raw, 0, 100));

  // Find weakest two axes — they drive the next-action prompt.
  const sortedByWeakness = (Object.keys(components) as Array<keyof HealthInputs>)
    .map((k) => ({ key: k, value: components[k] }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 2)
    .map((x) => x.key);

  return {
    score,
    components,
    riskLevel: deriveRiskLevel(score),
    weakestAxes: sortedByWeakness,
  };
}

/**
 * Concrete next-action template based on the weakest axis. Used as a
 * starting point — the cron can call an LLM on top to phrase it with
 * the actual recent context (last contact, deal stage, etc.). The
 * pure-function default keeps the daily queue useful even if the LLM
 * is unavailable.
 */
export function defaultNextActionFor(
  axis: keyof HealthInputs,
): { action: string; reason: string } {
  switch (axis) {
    case "usage":
      return {
        action: "Send a feature-spotlight email + propose a 15-min check-in",
        reason: "Product activity dropped — likely usage gap.",
      };
    case "sentiment":
      return {
        action: "Schedule an executive QBR within 7 days",
        reason: "Sentiment trended negative — risk of escalation.",
      };
    case "engagement":
      return {
        action: "Reach out to a different stakeholder (champion is silent)",
        reason: "Two-way contact thinned — single-thread risk.",
      };
    case "velocity":
      return {
        action: "Propose a concrete next step with a date",
        reason: "Deal velocity slowed below tenant median.",
      };
    case "support":
      return {
        action: "Triage the open objection / ticket personally",
        reason: "Open support load increased — friction surface.",
      };
  }
}
