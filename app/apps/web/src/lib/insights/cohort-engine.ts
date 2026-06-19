/**
 * Cohort intelligence — the honest version.
 *
 * The Method (step 17) is blunt about the trap: cutting deals every possible
 * way (persona, region, signal) and surfacing whatever looks good is
 * industrialised p-hacking at early-stage volume. With 30 deals some segment
 * always looks 4x better by pure chance. So this engine is built to do the
 * OPPOSITE of impressive: it returns very few "insights", and on data with no
 * real effect it must return ZERO (that is the headline test).
 *
 * Three tiers (step 17):
 *   - insight    : enough sample AND survives multiple-comparison correction.
 *                  A claim you can act on (e.g. weight this segment up).
 *   - hypothesis : a direction worth a controlled experiment, not a conclusion.
 *   - observation: noise, or too thin to say anything.
 *
 * Statistics done for small n, not for show:
 *   - Fisher's exact test (hypergeometric), not the two-proportion z-test —
 *     the normal approximation is unreliable at the counts founders actually
 *     have, and it over-declares significance exactly when it matters most.
 *   - Benjamini-Hochberg FDR control across all cohorts tested, because
 *     testing many cells inflates false positives (the p-hacking the doc warns
 *     about). An "insight" must clear q < 0.10, not raw p < 0.05.
 *   - A hard floor: below a minimum total of closed deals, the engine refuses
 *     to promote anything to "insight" and says so.
 *
 * Pure, no I/O — unit-tested with real-effect, null-effect and confounded
 * synthetic datasets.
 */

// ── log-gamma (Lanczos) so factorials of realistic counts don't overflow ──
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lgamma(x: number): number {
  if (x < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** log of n-choose-k. */
function lchoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/**
 * Fisher's exact test, one-tailed (is the cohort's "won" share HIGHER than the
 * rest?). Table: [[a,b],[c,d]] = [[cohort won, cohort lost],[rest won, rest
 * lost]]. Returns the probability of a table at least this enriched, given the
 * margins. p near 1 means "no evidence of enrichment".
 */
export function fisherExactGreater(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = a + b + c + d;
  if (n === 0 || row1 === 0 || col1 === 0) return 1;
  const xMin = Math.max(0, col1 - row2);
  const xMax = Math.min(row1, col1);
  // Hypergeometric pmf of cohort-won = x, summed for x >= a.
  let p = 0;
  for (let x = a; x <= xMax; x++) {
    if (x < xMin) continue;
    const logP = lchoose(row1, x) + lchoose(row2, col1 - x) - lchoose(n, col1);
    p += Math.exp(logP);
  }
  return Math.min(1, p);
}

/**
 * Benjamini-Hochberg FDR: turn p-values into q-values. Testing m cohorts, the
 * i-th smallest p becomes q = p * m / i, made monotone non-decreasing.
 */
export function benjaminiHochberg(pvalues: number[]): number[] {
  const m = pvalues.length;
  if (m === 0) return [];
  const idx = pvalues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = idx[rank - 1];
    const val = Math.min(prev, (p * m) / rank);
    q[i] = val;
    prev = val;
  }
  return q;
}

export type CohortTier = "insight" | "hypothesis" | "observation";

export interface CohortCell {
  /** Dimension name, e.g. "persona", "region", "industry", "signal". */
  dimension: string;
  /** The value within that dimension, e.g. "finance", "Île-de-France". */
  value: string;
  /** Closed deals in this cohort. */
  n: number;
  /** Won deals in this cohort. */
  won: number;
}

export interface ClassifiedCohort {
  dimension: string;
  value: string;
  n: number;
  won: number;
  rate: number;
  baselineRate: number;
  /** Multiplicative lift vs the rest of the population (rate / baselineRate). */
  lift: number;
  pValue: number;
  qValue: number;
  tier: CohortTier;
  recommendation: string;
}

export interface CohortAnalysisOptions {
  /** Minimum deals in a cohort before it can be an insight. Default 15. */
  minInsightN?: number;
  /** Minimum total closed deals before ANY insight is allowed. Default 20. */
  minTotalDeals?: number;
  /** FDR threshold for an insight. Default 0.10. */
  qThreshold?: number;
  /** Raw-p threshold for a (weaker) hypothesis. Default 0.20. */
  hypothesisP?: number;
  /** Minimum cohort n to bother proposing a hypothesis. Default 5. */
  minHypothesisN?: number;
}

export interface CohortAnalysis {
  totalDeals: number;
  totalWon: number;
  baselineRate: number;
  cohorts: ClassifiedCohort[];
  insights: ClassifiedCohort[];
  hypotheses: ClassifiedCohort[];
  /** Honest one-liner about what the data can and cannot support. */
  summary: string;
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Classify cohort cells into observation / hypothesis / insight. Each cell is
 * tested against the REST of the population (leave-one-out baseline), then
 * BH-corrected across all cells. Returns tiers plus an honest summary.
 */
export function classifyCohorts(
  cells: CohortCell[],
  opts: CohortAnalysisOptions = {},
): CohortAnalysis {
  const minInsightN = opts.minInsightN ?? 15;
  const minTotalDeals = opts.minTotalDeals ?? 20;
  const qThreshold = opts.qThreshold ?? 0.1;
  const hypothesisP = opts.hypothesisP ?? 0.2;
  const minHypothesisN = opts.minHypothesisN ?? 5;

  const totalDeals = cells.reduce((s, c) => s + c.n, 0);
  const totalWon = cells.reduce((s, c) => s + c.won, 0);
  const baselineRate = totalDeals > 0 ? totalWon / totalDeals : 0;

  // One-tailed Fisher p per cell vs the rest (leave-one-out).
  const pvals = cells.map((c) => {
    const restN = totalDeals - c.n;
    const restWon = totalWon - c.won;
    return fisherExactGreater(c.won, c.n - c.won, restWon, restN - restWon);
  });
  const qvals = benjaminiHochberg(pvals);

  const enoughData = totalDeals >= minTotalDeals;

  const cohorts: ClassifiedCohort[] = cells.map((c, i) => {
    const rate = c.n > 0 ? c.won / c.n : 0;
    const restN = totalDeals - c.n;
    const restWon = totalWon - c.won;
    const baseRate = restN > 0 ? restWon / restN : 0;
    const lift = baseRate > 0 ? rate / baseRate : rate > 0 ? Infinity : 1;
    const p = pvals[i];
    const q = qvals[i];

    let tier: CohortTier = "observation";
    if (enoughData && c.n >= minInsightN && q < qThreshold && rate > baseRate) {
      tier = "insight";
    } else if (c.n >= minHypothesisN && p < hypothesisP && rate > baseRate) {
      tier = "hypothesis";
    }

    const recommendation =
      tier === "insight"
        ? `Your deals in ${c.dimension} = ${c.value} close at ${Math.round(rate * 100)}% vs ${Math.round(baseRate * 100)}% elsewhere (n=${c.n}). Consider weighting this segment up in targeting — with a human decision, not automatically.`
        : tier === "hypothesis"
          ? `${c.dimension} = ${c.value} looks stronger (${Math.round(rate * 100)}% vs ${Math.round(baseRate * 100)}%, n=${c.n}) but the sample is too thin to trust. Test it: split your next first touches and compare.`
          : "";

    return {
      dimension: c.dimension,
      value: c.value,
      n: c.n,
      won: c.won,
      rate: round(rate),
      baselineRate: round(baseRate),
      lift: Number.isFinite(lift) ? round(lift, 2) : lift,
      pValue: round(p, 4),
      qValue: round(q, 4),
      tier,
      recommendation,
    };
  });

  const insights = cohorts.filter((c) => c.tier === "insight");
  const hypotheses = cohorts.filter((c) => c.tier === "hypothesis");

  let summary: string;
  if (!enoughData) {
    summary =
      `Only ${totalDeals} closed deals so far — too few to call anything an insight. ` +
      (hypotheses.length > 0
        ? `${hypotheses.length} pattern(s) worth testing, not concluding.`
        : `Keep closing; patterns become trustworthy past ~${minTotalDeals} to 30 deals.`);
  } else if (insights.length === 0) {
    summary =
      `${totalDeals} closed deals, and no segment stands out beyond chance once corrected for testing many cuts. ` +
      (hypotheses.length > 0 ? `${hypotheses.length} hypothesis(es) to test.` : `No segment to act on yet — that is a real answer, not a gap.`);
  } else {
    summary = `${insights.length} segment(s) close significantly better than the rest, after correcting for multiple comparisons.`;
  }

  // Insights first, then hypotheses, then the rest — each group by lift.
  const tierRank: Record<CohortTier, number> = { insight: 0, hypothesis: 1, observation: 2 };
  cohorts.sort(
    (a, b) =>
      tierRank[a.tier] - tierRank[b.tier] ||
      (Number.isFinite(b.lift as number) ? (b.lift as number) : 0) -
        (Number.isFinite(a.lift as number) ? (a.lift as number) : 0),
  );

  return { totalDeals, totalWon, baselineRate: round(baselineRate), cohorts, insights, hypotheses, summary };
}
