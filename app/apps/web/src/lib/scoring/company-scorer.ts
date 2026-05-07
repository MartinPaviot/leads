/**
 * Company scoring with learned model + rules fallback.
 *
 * When a tenant has enough closed deals (>= 10), uses the Naive Bayes
 * model trained on their company data. Otherwise falls back to the
 * deterministic calculateFitScore().
 */

import { calculateFitScore, type FitIcp, type FitScoreResult } from "./scoring";
import { scoreDeal, type ScoringModel } from "./predictive-scorer";
import type { CompanyScoringModel } from "./company-model-trainer";

const MIN_MODEL_SAMPLES = 10;

export interface CompanyScoreResult {
  score: number;
  reasons: string[];
  source: "model" | "rules";
}

/**
 * Score a company using the trained model when available, falling
 * back to the rules-based fit score otherwise.
 *
 * The caller passes both the company row (for rules) and the model
 * (from tenant settings). When model is null or has < 10 samples,
 * rules are used automatically.
 */
export function scoreCompanyWithModel(
  company: Record<string, unknown>,
  props: Record<string, unknown>,
  icp: FitIcp | undefined,
  model: CompanyScoringModel | null | undefined,
): CompanyScoreResult {
  if (model && model.sampleSize >= MIN_MODEL_SAMPLES) {
    const industry = ((company.industry as string) || "unknown").toLowerCase().trim();
    const size = ((company.size as string) || "unknown").toLowerCase().trim();
    const country = ((props.country as string) || "unknown").toLowerCase().trim();
    const fundingStage = ((props.latest_funding_stage as string) || "none").toLowerCase().trim();

    const hasRecentFunding = Boolean(props.latest_funding_raised_at);
    const techOverlap = Array.isArray(props.technologies)
      ? (props.technologies as string[]).length > 0
      : false;

    const features = {
      industry,
      companySize: size,
      valueBucket: "medium" as const,
      stageVelocityDays: 14,
      contactsEngaged: 1,
      meetingCount: 0,
      emailSentiment: "neutral" as const,
      hasChampion: hasRecentFunding,
      hasCompetitor: techOverlap,
    };

    const result = scoreDeal(features, model);
    const score = Math.round(result.probability * 100);

    const reasons = [
      `Learned from ${model.sampleSize} closed deals`,
      ...result.topFactors,
    ];

    return { score, reasons, source: "model" };
  }

  const fit = calculateFitScore(company, props, icp);
  return { score: fit.score, reasons: fit.reasons, source: "rules" };
}
