/**
 * The revenue equation — honest pipeline forecasting.
 *
 * The Method (steps 1, 8) holds revenue as opportunities x conversion x deal
 * size, and holds the line on statistical honesty: a single weighted-pipeline
 * number is a coin flip dressed up as a forecast, because the real stage-rate
 * variances make the standard deviation of the forecast roughly equal to its
 * mean (CV ~ 1). So this engine never returns a bare point estimate: it
 * returns a range, names the actual bottleneck, and says out loud when the
 * numbers are too thin to trust (prior-dominated).
 *
 * It also encodes the demand-first prior (step 1): when opportunities in play
 * fall short of what the goal needs, the bottleneck is demand, not conversion
 * — the diagnosis nine founders in ten get wrong.
 *
 * Pure, no I/O. Deterministic point estimate + delta-method CV range (the
 * Monte Carlo / Sobol refinement from the research is intentionally deferred;
 * this v1 is the honest core). Sources: elevay-mastery-02 (pipeline math),
 * outbound benchmark priors.
 */

/** Per-stage benchmark priors (mean, stdev). Used when the tenant's own
 *  counts are too sparse to estimate a rate. From multi-million-send/dial
 *  datasets; deliberately weak so a tenant's own data dominates quickly. */
interface Prior {
  mean: number;
  sd: number;
}
const PRIORS: Record<StageKey, Prior> = {
  reply: { mean: 0.034, sd: 0.025 },
  replyToBooked: { mean: 0.62, sd: 0.15 },
  bookedToShowed: { mean: 0.8, sd: 0.1 },
  showedToQualified: { mean: 0.55, sd: 0.15 },
  qualifiedToProposal: { mean: 0.7, sd: 0.12 },
  proposalToWon: { mean: 0.22, sd: 0.07 },
};
/** Coefficient of variation of deal size (lognormal tail), used in the
 *  range propagation. ACV uncertainty is real and must not be hidden. */
const ACV_CV = 0.5;

/** Minimum denominator before we trust an observed rate over the prior. */
const MIN_TRIALS_FOR_OBSERVED = 20;

/** Default founder capacity: active deals one founder can genuinely hold
 *  (step 5). Past this, more top-of-funnel is wasted. */
export const DEFAULT_CAPACITY_CAP = 16;

/** Coverage multiple: opportunities in play should exceed K x the deals the
 *  goal needs, or the funnel is demand-constrained (step 1, K~4). */
const COVERAGE_MULTIPLE = 4;

export type StageKey =
  | "reply"
  | "replyToBooked"
  | "bookedToShowed"
  | "showedToQualified"
  | "qualifiedToProposal"
  | "proposalToWon";

const STAGE_ORDER: StageKey[] = [
  "reply",
  "replyToBooked",
  "bookedToShowed",
  "showedToQualified",
  "qualifiedToProposal",
  "proposalToWon",
];

/** The tenant's own observed counts over the period (any subset). Each rate
 *  is derived as numerator/denominator; absent or under-powered denominators
 *  fall back to the prior. */
export interface FunnelObservation {
  contacted?: number;
  replied?: number;
  booked?: number;
  showed?: number;
  qualified?: number;
  proposal?: number;
  won?: number;
}

export interface RevEquationInput {
  /** Top-of-funnel volume for the forecast horizon. */
  contactedForecast: number;
  /** The tenant's real funnel counts (to derive rates and confidence). */
  observed?: FunnelObservation;
  /** Average deal value. Caller decides the unit (project, ARR, or blend);
   *  bookings are not ARR — keep them separate upstream. */
  acv: number;
  /** Revenue goal for the horizon, same unit as acv x deals. */
  goal?: number | null;
  /** Current open opportunities (for the capacity check). */
  activeDeals?: number | null;
  /** Founder capacity cap; defaults to DEFAULT_CAPACITY_CAP. */
  capacityCap?: number | null;
}

export type Bottleneck = "demand" | "conversion" | "capacity";
export type DataConfidence = "prior-dominated" | "blending" | "data-dominated";

export interface RevEquationOutput {
  /** Expected closed-won deals over the horizon (point estimate). */
  expectedDeals: number;
  /** Forecast revenue with an 80% range — never a bare point. */
  revenue: { mean: number; p10: number; p90: number; cvPercent: number };
  /** Effective stage rates used (observed where powered, else prior). */
  rates: Record<StageKey, number>;
  /** Which rates came from the tenant vs the benchmark prior. */
  rateSource: Record<StageKey, "observed" | "prior">;
  bottleneck: Bottleneck;
  /** Coverage of the goal, when a goal is set. */
  coverage: { dealsNeeded: number; oppsInPlay: number; ratio: number } | null;
  dataConfidence: DataConfidence;
  /** One honest sentence a founder can act on. */
  diagnosis: string;
  /** Caveats worth stating (small n, prior-dominated, etc.). */
  notes: string[];
}

function rateOf(num: number | undefined, den: number | undefined): number | null {
  if (num == null || den == null || den < MIN_TRIALS_FOR_OBSERVED || den <= 0) return null;
  return Math.min(1, Math.max(0, num / den));
}

/** Pull the (numerator, denominator) pair for each stage from observed counts. */
function observedRate(stage: StageKey, o: FunnelObservation): number | null {
  switch (stage) {
    case "reply": return rateOf(o.replied, o.contacted);
    case "replyToBooked": return rateOf(o.booked, o.replied);
    case "bookedToShowed": return rateOf(o.showed, o.booked);
    case "showedToQualified": return rateOf(o.qualified, o.showed);
    case "qualifiedToProposal": return rateOf(o.proposal, o.qualified);
    case "proposalToWon": return rateOf(o.won, o.proposal);
  }
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function computeRevEquation(input: RevEquationInput): RevEquationOutput {
  const o = input.observed ?? {};
  const notes: string[] = [];

  // 1. Effective rates: tenant's own where powered, else prior.
  const rates = {} as Record<StageKey, number>;
  const rateSource = {} as Record<StageKey, "observed" | "prior">;
  let observedCount = 0;
  for (const stage of STAGE_ORDER) {
    const obs = observedRate(stage, o);
    if (obs != null) {
      rates[stage] = obs;
      rateSource[stage] = "observed";
      observedCount++;
    } else {
      rates[stage] = PRIORS[stage].mean;
      rateSource[stage] = "prior";
    }
  }

  // 2. Data confidence. The close rate is the slowest to calibrate (it needs
  //    hundreds of proposals), so weight it: prior-dominated unless real
  //    volume exists.
  const dataConfidence: DataConfidence =
    observedCount >= 5 ? "data-dominated" : observedCount >= 2 ? "blending" : "prior-dominated";
  if (dataConfidence === "prior-dominated") {
    notes.push(
      "Mostly benchmark priors, not your data yet — treat the range as wide and the point as indicative.",
    );
  }

  // 3. Point estimate: contacted x product of rates x ACV.
  const chain = STAGE_ORDER.reduce((p, s) => p * rates[s], 1);
  const expectedDeals = input.contactedForecast * chain;
  const meanRevenue = expectedDeals * input.acv;

  // 4. Range via delta method: CV^2 of a product of independent rates is the
  //    sum of each stage's CV^2, plus the ACV CV^2. (elevay-mastery-02 §3.5)
  let cvSq = ACV_CV ** 2;
  for (const stage of STAGE_ORDER) {
    const mean = rateSource[stage] === "observed" ? rates[stage] : PRIORS[stage].mean;
    const sd = PRIORS[stage].sd; // prior sd as the honest uncertainty floor
    if (mean > 0) cvSq += (sd / mean) ** 2;
  }
  const cv = Math.sqrt(cvSq);
  // 80% interval. With CV near 1 the distribution is right-skewed; clamp p10
  // at 0 (revenue can't be negative) and use a lognormal-ish spread.
  const p10 = Math.max(0, meanRevenue * Math.max(0, 1 - 1.28 * cv));
  const p90 = meanRevenue * (1 + 1.28 * cv);

  // 5. Bottleneck. Capacity first (a full pipeline makes new top-of-funnel
  //    wasted), then demand vs conversion against the goal.
  const cap = input.capacityCap ?? DEFAULT_CAPACITY_CAP;
  const activeDeals = input.activeDeals ?? null;
  let bottleneck: Bottleneck;
  let coverage: RevEquationOutput["coverage"] = null;
  let diagnosis: string;

  if (activeDeals != null && activeDeals >= cap) {
    bottleneck = "capacity";
    diagnosis =
      `You are at capacity (${activeDeals} active deals vs a ~${cap} cap). The next hour closes existing deals; new prospecting overflows and is wasted.`;
  } else if (input.goal && input.goal > 0 && input.acv > 0) {
    const dealsNeeded = input.goal / input.acv;
    // Opportunities in play now: qualified + proposal stages if known, else
    // the forecast's expected deals as a proxy.
    const oppsInPlay =
      (o.qualified ?? 0) + (o.proposal ?? 0) || round(expectedDeals, 1);
    const ratio = dealsNeeded > 0 ? oppsInPlay / dealsNeeded : 0;
    coverage = { dealsNeeded: round(dealsNeeded, 1), oppsInPlay: round(oppsInPlay, 1), ratio: round(ratio, 2) };
    if (ratio < COVERAGE_MULTIPLE) {
      bottleneck = "demand";
      diagnosis =
        `Demand-constrained: ~${round(oppsInPlay, 1)} opportunities in play for a goal that needs ~${round(dealsNeeded, 1)} closed. ` +
        `You need more at the top of the funnel before conversion is the problem.`;
    } else {
      bottleneck = "conversion";
      diagnosis =
        `Enough demand (~${round(oppsInPlay, 1)} in play for ~${round(dealsNeeded, 1)} needed). The leverage now is conversion: discovery quality, multi-threading, the proposal.`;
    }
  } else {
    // No goal set: default to the demand-first prior (step 1).
    bottleneck = "demand";
    diagnosis =
      "Set a revenue goal to get a real bottleneck read. The default prior for early-stage is demand: more qualified conversations beats squeezing conversion.";
    notes.push("No revenue goal set — coverage and bottleneck are indicative.");
  }

  if (input.acv <= 0) notes.push("ACV is zero or unset — revenue figures are not meaningful until set.");

  return {
    expectedDeals: round(expectedDeals, 2),
    revenue: {
      mean: Math.round(meanRevenue),
      p10: Math.round(p10),
      p90: Math.round(p90),
      cvPercent: Math.round(cv * 100),
    },
    rates,
    rateSource,
    bottleneck,
    coverage,
    dataConfidence,
    diagnosis,
    notes,
  };
}
