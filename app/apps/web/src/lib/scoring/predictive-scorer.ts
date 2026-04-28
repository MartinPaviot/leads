/**
 * Predictive Deal Scoring — learns from historical won/lost deals
 * to predict win probability for active deals.
 *
 * Model: Naive Bayes with Laplace smoothing.
 * Features: industry, company size, deal value bucket, stage velocity,
 *           number of contacts engaged, meeting count, email sentiment,
 *           champion identified, competitor present.
 *
 * The model updates weekly via Inngest cron by:
 * 1. Querying all closed deals (won + lost) in the last 12 months
 * 2. Extracting features from each deal + its activities
 * 3. Computing P(won | features) using Bayesian inference
 * 4. Storing the model weights in tenant settings
 *
 * Active deals are scored on-demand using the learned weights.
 *
 * This is a real Naive Bayes classifier — no LLM involved. The math
 * is straightforward, the model is tiny (just counts), and it runs
 * in milliseconds.
 */

// ── Types ────────────────────────────────────────────────────

export interface DealFeatures {
  industry: string;
  companySize: string;
  valueBucket: "small" | "medium" | "large" | "enterprise";
  stageVelocityDays: number;
  contactsEngaged: number;
  meetingCount: number;
  emailSentiment: "positive" | "neutral" | "negative";
  hasChampion: boolean;
  hasCompetitor: boolean;
}

export interface ClosedDealData {
  outcome: "won" | "lost";
  features: DealFeatures;
}

/**
 * Naive Bayes model stored as feature counts. Small enough to fit
 * in a JSONB column (~2-5 KB for a typical tenant).
 *
 * featureWeights structure:
 *   featureWeights["industry"]["saas"] = { wins: 12, losses: 3 }
 *   featureWeights["valueBucket"]["enterprise"] = { wins: 2, losses: 8 }
 *
 * Each feature is treated as categorical. Continuous features
 * (stageVelocityDays, contactsEngaged, meetingCount) are bucketed
 * into categorical bins before training.
 */
export interface ScoringModel {
  priorWinRate: number;
  featureWeights: Record<string, Record<string, { wins: number; losses: number }>>;
  trainedAt: string;
  sampleSize: number;
}

export interface ScoreResult {
  probability: number;
  topFactors: string[];
}

// ── Feature bucketing ────────────────────────────────────────

/**
 * Bucket a deal value (in cents or dollars, typically) into a named tier.
 */
export function valueToBucket(value: number | null | undefined): DealFeatures["valueBucket"] {
  if (!value || value <= 0) return "small";
  if (value < 5_000) return "small";
  if (value < 25_000) return "medium";
  if (value < 100_000) return "large";
  return "enterprise";
}

/**
 * Bucket stage velocity (days in pipeline) into a categorical label.
 */
function velocityBucket(days: number): string {
  if (days <= 7) return "fast";
  if (days <= 21) return "normal";
  if (days <= 45) return "slow";
  return "stalled";
}

/**
 * Bucket contact engagement count.
 */
function engagementBucket(contacts: number): string {
  if (contacts <= 1) return "single_thread";
  if (contacts <= 3) return "multi_contact";
  return "broad_engagement";
}

/**
 * Bucket meeting count.
 */
function meetingBucket(meetings: number): string {
  if (meetings === 0) return "no_meetings";
  if (meetings <= 2) return "few_meetings";
  return "many_meetings";
}

// ── Feature extraction (from deal to categorical map) ────────

/**
 * Convert DealFeatures into a flat key-value map of categorical features.
 * Each key is a feature name, each value is the categorical bin.
 */
function featuresToCategorical(f: DealFeatures): Record<string, string> {
  return {
    industry: (f.industry || "unknown").toLowerCase().trim() || "unknown",
    companySize: (f.companySize || "unknown").toLowerCase().trim() || "unknown",
    valueBucket: f.valueBucket,
    stageVelocity: velocityBucket(f.stageVelocityDays),
    contactsEngaged: engagementBucket(f.contactsEngaged),
    meetingCount: meetingBucket(f.meetingCount),
    emailSentiment: f.emailSentiment || "neutral",
    hasChampion: f.hasChampion ? "yes" : "no",
    hasCompetitor: f.hasCompetitor ? "yes" : "no",
  };
}

// ── Training ─────────────────────────────────────────────────

/** Laplace smoothing constant. Prevents zero probabilities. */
const LAPLACE_ALPHA = 1;

/**
 * Train a Naive Bayes scoring model from closed deals.
 *
 * Requires at least 5 deals to produce a meaningful model. With fewer,
 * returns a model that defaults to the global average win rate.
 *
 * @param closedDeals - Array of closed deals with outcome and features
 * @returns Trained ScoringModel ready for scoring
 */
export function trainScoringModel(closedDeals: ClosedDealData[]): ScoringModel {
  const totalWins = closedDeals.filter((d) => d.outcome === "won").length;
  const totalLosses = closedDeals.filter((d) => d.outcome === "lost").length;
  const total = totalWins + totalLosses;

  const priorWinRate = total > 0 ? totalWins / total : 0.5;

  const featureWeights: ScoringModel["featureWeights"] = {};

  for (const deal of closedDeals) {
    const cats = featuresToCategorical(deal.features);
    const isWin = deal.outcome === "won";

    for (const [featureName, featureValue] of Object.entries(cats)) {
      if (!featureWeights[featureName]) {
        featureWeights[featureName] = {};
      }
      if (!featureWeights[featureName][featureValue]) {
        featureWeights[featureName][featureValue] = { wins: 0, losses: 0 };
      }
      if (isWin) {
        featureWeights[featureName][featureValue].wins++;
      } else {
        featureWeights[featureName][featureValue].losses++;
      }
    }
  }

  return {
    priorWinRate,
    featureWeights,
    trainedAt: new Date().toISOString(),
    sampleSize: total,
  };
}

// ── Scoring ──────────────────────────────────────────────────

/**
 * Human-readable labels for feature names, used when explaining
 * the top factors to the user.
 */
const FEATURE_LABELS: Record<string, string> = {
  industry: "Industry",
  companySize: "Company size",
  valueBucket: "Deal size",
  stageVelocity: "Pipeline velocity",
  contactsEngaged: "Contact engagement",
  meetingCount: "Meetings held",
  emailSentiment: "Email sentiment",
  hasChampion: "Champion identified",
  hasCompetitor: "Competitor present",
};

/**
 * Score a deal using the trained Naive Bayes model.
 *
 * Returns:
 * - probability: win probability (0-1), clamped to [0.01, 0.99]
 * - topFactors: up to 3 human-readable factors with the most influence
 *
 * If the model has too few samples (<5), falls back to the stage-based
 * probability and returns a disclaimer factor.
 */
export function scoreDeal(
  deal: DealFeatures,
  model: ScoringModel,
): ScoreResult {
  // Insufficient training data — fall back to prior
  if (model.sampleSize < 5) {
    return {
      probability: model.priorWinRate,
      topFactors: ["Insufficient historical data (need 5+ closed deals)"],
    };
  }

  const cats = featuresToCategorical(deal);

  // Compute log-odds for each feature using Naive Bayes with Laplace smoothing.
  //
  // For each feature f with value v:
  //   P(v | won)  = (wins(v) + alpha) / (totalWins + alpha * |V_f|)
  //   P(v | lost) = (losses(v) + alpha) / (totalLosses + alpha * |V_f|)
  //
  // Log-likelihood ratio per feature:
  //   llr_f = log(P(v|won)) - log(P(v|lost))
  //
  // Total log-posterior ratio:
  //   log(P(won|X) / P(lost|X)) = log(prior_won/prior_lost) + sum(llr_f)

  const totalWins = Math.round(model.priorWinRate * model.sampleSize);
  const totalLosses = model.sampleSize - totalWins;

  let logOdds = Math.log((totalWins + LAPLACE_ALPHA) / (totalLosses + LAPLACE_ALPHA));

  const featureContributions: { feature: string; value: string; contribution: number }[] = [];

  for (const [featureName, featureValue] of Object.entries(cats)) {
    const featureMap = model.featureWeights[featureName];
    if (!featureMap) continue;

    // Number of unique values seen for this feature (vocabulary size)
    const vocabSize = Object.keys(featureMap).length;

    const counts = featureMap[featureValue] || { wins: 0, losses: 0 };

    const pGivenWin = (counts.wins + LAPLACE_ALPHA) / (totalWins + LAPLACE_ALPHA * (vocabSize + 1));
    const pGivenLoss = (counts.losses + LAPLACE_ALPHA) / (totalLosses + LAPLACE_ALPHA * (vocabSize + 1));

    const llr = Math.log(pGivenWin) - Math.log(pGivenLoss);
    logOdds += llr;

    featureContributions.push({
      feature: featureName,
      value: featureValue,
      contribution: llr,
    });
  }

  // Convert log-odds to probability using sigmoid
  const probability = clamp(sigmoid(logOdds), 0.01, 0.99);

  // Identify top 3 factors (by absolute contribution, sorted by magnitude)
  const sorted = featureContributions.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const topFactors = sorted.slice(0, 3).map((fc) => {
    const label = FEATURE_LABELS[fc.feature] || fc.feature;
    const direction = fc.contribution > 0 ? "+" : "-";
    return `${label}: ${fc.value} (${direction})`;
  });

  return { probability, topFactors };
}

// ── Math helpers ─────────────────────────────────────────────

function sigmoid(x: number): number {
  // Clamp input to avoid overflow
  const clamped = Math.max(-20, Math.min(20, x));
  return 1 / (1 + Math.exp(-clamped));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
