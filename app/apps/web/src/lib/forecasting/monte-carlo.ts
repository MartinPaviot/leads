/**
 * Monte Carlo Revenue Forecasting
 *
 * Goes beyond simple pipeline x probability. Simulates thousands of
 * possible outcomes by:
 * 1. Taking each active deal's predictive score (from Bayesian scorer)
 * 2. Sampling win/loss for each deal using the score as probability
 * 3. For won deals, sampling close date using stage velocity distribution
 * 4. Aggregating revenue per time period (week/month/quarter)
 * 5. Computing confidence intervals (p10, p50, p90)
 *
 * The result: "We expect $150K-$280K this quarter (80% confidence)"
 * instead of "Pipeline: $500K x 35% = $175K"
 *
 * Pure math, no LLM. Runs 10,000 simulations in milliseconds.
 */

import { stageProbability } from "@/lib/deal-helpers";
import type { ScoringModel, ScoreResult } from "@/lib/scoring/predictive-scorer";
import { scoreDeal, valueToBucket } from "@/lib/scoring/predictive-scorer";

// ── Types ────────────────────────────────────────────────────

export interface ActiveDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  expectedCloseDate: string | null;
  /** Days the deal has been in the current stage. */
  daysInCurrentStage: number;
  /** Features for predictive scoring. */
  features?: {
    industry: string;
    companySize: string;
    contactsEngaged: number;
    meetingCount: number;
    emailSentiment: "positive" | "neutral" | "negative";
    hasChampion: boolean;
    hasCompetitor: boolean;
  };
}

export interface ForecastScenario {
  /** Period label: "2026-Q2", "2026-05", "2026-W18" */
  period: string;
  /** Pessimistic (10th percentile) */
  p10: number;
  /** Likely (median) */
  p50: number;
  /** Optimistic (90th percentile) */
  p90: number;
  mean: number;
  dealCount: number;
}

export interface ForecastResult {
  scenarios: ForecastScenario[];
  topDeals: Array<{
    id: string;
    name: string;
    value: number;
    winProbability: number;
    expectedCloseWeek: string;
  }>;
  riskFactors: string[];
  simulationCount: number;
  computedAt: string;
}

type Granularity = "week" | "month" | "quarter";

interface ForecastOptions {
  simulations?: number;
  horizonMonths?: number;
  granularity?: Granularity;
}

// ── Seeded PRNG (Mulberry32) ────────────────────────────────
// Deterministic for reproducibility in tests; random seed in production.

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Box-Muller transform for normal distribution ────────────

function normalRandom(
  mean: number,
  stddev: number,
  rand: () => number,
): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) *
    Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ── Period helpers ───────────────────────────────────────────

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dateToPeriod(date: Date, granularity: Granularity): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  switch (granularity) {
    case "week":
      return `${y}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
    case "month":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.ceil(m / 3)}`;
  }
}

function periodSortKey(period: string): number {
  // Convert period strings to a comparable number.
  // "2026-Q2" -> 20260402, "2026-05" -> 20260500, "2026-W18" -> 20260018
  const year = parseInt(period.slice(0, 4), 10) * 10000;
  if (period.includes("Q")) {
    const quarter = parseInt(period.slice(6), 10);
    return year + quarter * 100 + 1;
  }
  if (period.includes("W")) {
    const week = parseInt(period.slice(6), 10);
    return year + week;
  }
  // Month
  const month = parseInt(period.slice(5), 10);
  return year + month * 100;
}

// ── Win probability resolution ──────────────────────────────

function resolveWinProbability(
  deal: ActiveDeal,
  scoringModel: ScoringModel | null,
): number {
  // Prefer Bayesian predictive model when available
  if (scoringModel && deal.features) {
    const result: ScoreResult = scoreDeal(
      {
        industry: deal.features.industry,
        companySize: deal.features.companySize,
        valueBucket: valueToBucket(deal.value),
        stageVelocityDays: deal.daysInCurrentStage,
        contactsEngaged: deal.features.contactsEngaged,
        meetingCount: deal.features.meetingCount,
        emailSentiment: deal.features.emailSentiment,
        hasChampion: deal.features.hasChampion,
        hasCompetitor: deal.features.hasCompetitor,
      },
      scoringModel,
    );
    return result.probability;
  }

  // Fallback: stage-based probability
  const prob = stageProbability(deal.stage);
  return prob !== null ? prob / 100 : 0.25; // default 25% for unknown stages
}

// ── Expected close date resolution ──────────────────────────

function resolveExpectedCloseMs(
  deal: ActiveDeal,
  rand: () => number,
): number {
  const now = Date.now();

  if (deal.expectedCloseDate) {
    const expected = new Date(deal.expectedCloseDate).getTime();
    if (expected > now) {
      // Add normally-distributed noise around the expected close date.
      // Standard deviation scales with how far out the close date is,
      // but is at least 3 days.
      const daysOut = (expected - now) / 86400000;
      const stddevDays = Math.max(3, daysOut * 0.2);
      const sampledDays = Math.max(1, normalRandom(daysOut, stddevDays, rand));
      return now + sampledDays * 86400000;
    }
    // Past due: sample 1-30 additional days from now
    const additionalDays = Math.max(1, normalRandom(14, 7, rand));
    return now + additionalDays * 86400000;
  }

  // No expected close date: estimate based on stage velocity.
  // Assume ~2 remaining stages at ~14 days each.
  const baseDays = 28;
  const stddevDays = 10;
  const sampledDays = Math.max(3, normalRandom(baseDays, stddevDays, rand));
  return now + sampledDays * 86400000;
}

// ── Risk factor detection ───────────────────────────────────

function detectRiskFactors(
  deals: ActiveDeal[],
  probabilities: Map<string, number>,
): string[] {
  const risks: string[] = [];
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);

  // Concentration risk: any deal > 50% of pipeline
  for (const deal of deals) {
    if (totalValue > 0 && deal.value / totalValue > 0.5) {
      risks.push(
        `Pipeline concentration: "${deal.name}" represents ${Math.round((deal.value / totalValue) * 100)}% of total pipeline value`,
      );
    }
  }

  // Past-due deals
  const now = new Date();
  const pastDue = deals.filter(
    (d) => d.expectedCloseDate && new Date(d.expectedCloseDate) < now,
  );
  if (pastDue.length > 0) {
    risks.push(
      `${pastDue.length} deal${pastDue.length > 1 ? "s" : ""} past expected close date: ${pastDue.map((d) => `"${d.name}"`).join(", ")}`,
    );
  }

  // Low-probability large deals
  for (const deal of deals) {
    const prob = probabilities.get(deal.id) ?? 0;
    if (deal.value >= 10000 && prob < 0.2) {
      risks.push(
        `Low probability on large deal: "${deal.name}" ($${deal.value.toLocaleString()}) at ${Math.round(prob * 100)}% win probability`,
      );
    }
  }

  // Stalled deals (> 30 days in current stage)
  const stalled = deals.filter((d) => d.daysInCurrentStage > 30);
  if (stalled.length > 0) {
    risks.push(
      `${stalled.length} stalled deal${stalled.length > 1 ? "s" : ""} (>30 days in stage): ${stalled.map((d) => `"${d.name}"`).join(", ")}`,
    );
  }

  return risks;
}

// ── Core Monte Carlo simulation ─────────────────────────────

export function runMonteCarloForecast(
  deals: ActiveDeal[],
  scoringModel: ScoringModel | null,
  options?: ForecastOptions,
): ForecastResult {
  const simulations = options?.simulations ?? 10_000;
  const horizonMonths = options?.horizonMonths ?? 3;
  const granularity = options?.granularity ?? "month";

  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + horizonMonths);
  const horizonMs = horizon.getTime();

  // Pre-compute win probabilities for each deal
  const probabilities = new Map<string, number>();
  for (const deal of deals) {
    probabilities.set(deal.id, resolveWinProbability(deal, scoringModel));
  }

  // Accumulator: period -> array of per-simulation revenue totals
  const periodRevenueMap = new Map<string, number[]>();
  // Track how many simulations produced revenue in each period
  const periodDealCountMap = new Map<string, Set<string>>();

  const seed = (Date.now() % 2147483647) | 1;
  const rand = mulberry32(seed);

  for (let sim = 0; sim < simulations; sim++) {
    // Temporary accumulator for this simulation
    const simRevenue = new Map<string, number>();

    for (const deal of deals) {
      const winProb = probabilities.get(deal.id)!;

      // Flip weighted coin
      if (rand() > winProb) continue; // Deal lost in this simulation

      // Deal won — sample close date
      const closeDateMs = resolveExpectedCloseMs(deal, rand);

      // Skip deals that close beyond our forecast horizon
      if (closeDateMs > horizonMs) continue;

      const closeDate = new Date(closeDateMs);
      const period = dateToPeriod(closeDate, granularity);

      simRevenue.set(period, (simRevenue.get(period) ?? 0) + deal.value);

      // Track which deals contributed to which period (across all sims)
      if (!periodDealCountMap.has(period)) {
        periodDealCountMap.set(period, new Set());
      }
      periodDealCountMap.get(period)!.add(deal.id);
    }

    // Record this simulation's results
    for (const [period, revenue] of simRevenue) {
      if (!periodRevenueMap.has(period)) {
        periodRevenueMap.set(period, []);
      }
      periodRevenueMap.get(period)!.push(revenue);
    }
  }

  // Compute percentiles for each period
  const scenarios: ForecastScenario[] = [];

  for (const [period, revenues] of periodRevenueMap) {
    // Pad with zeros for simulations where no deals closed in this period
    while (revenues.length < simulations) {
      revenues.push(0);
    }
    revenues.sort((a, b) => a - b);

    const p10Idx = Math.floor(simulations * 0.1);
    const p50Idx = Math.floor(simulations * 0.5);
    const p90Idx = Math.floor(simulations * 0.9);

    const mean = revenues.reduce((sum, r) => sum + r, 0) / simulations;

    scenarios.push({
      period,
      p10: Math.round(revenues[p10Idx]),
      p50: Math.round(revenues[p50Idx]),
      p90: Math.round(revenues[p90Idx]),
      mean: Math.round(mean),
      dealCount: periodDealCountMap.get(period)?.size ?? 0,
    });
  }

  // Sort scenarios chronologically
  scenarios.sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));

  // Top deals: sorted by expected revenue contribution (value * probability)
  const topDeals = deals
    .map((d) => {
      const prob = probabilities.get(d.id)!;
      return {
        id: d.id,
        name: d.name,
        value: d.value,
        winProbability: Math.round(prob * 100) / 100,
        expectedCloseWeek: d.expectedCloseDate
          ? dateToPeriod(new Date(d.expectedCloseDate), "week")
          : dateToPeriod(
              new Date(Date.now() + 28 * 86400000),
              "week",
            ),
        _sortKey: d.value * prob,
      };
    })
    .sort((a, b) => b._sortKey - a._sortKey)
    .slice(0, 10)
    .map(({ _sortKey, ...rest }) => rest);

  // Risk factors
  const riskFactors = detectRiskFactors(deals, probabilities);

  return {
    scenarios,
    topDeals,
    riskFactors,
    simulationCount: simulations,
    computedAt: new Date().toISOString(),
  };
}
