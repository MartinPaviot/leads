/**
 * Company-level Naive Bayes model trainer.
 *
 * Reuses the same Naive Bayes + Laplace smoothing math as the deal
 * scorer but with company-centric features: industry, size, geography,
 * funding stage, tech stack overlap with won-deal companies.
 *
 * Training data: companies from closed deals — won = positive, lost = negative.
 * Requires >= 10 closed deals to produce a meaningful model.
 */

import {
  trainScoringModel,
  type ClosedDealData,
  type DealFeatures,
  type ScoringModel,
} from "./predictive-scorer";

export type CompanyScoringModel = ScoringModel;

export interface CompanyTrainingRow {
  outcome: "won" | "lost";
  industry: string;
  companySize: string;
  country: string;
  fundingStage: string;
  hasRecentFunding: boolean;
  techStackOverlap: number;
}

function companyRowToFeatures(row: CompanyTrainingRow): DealFeatures {
  return {
    industry: row.industry || "unknown",
    companySize: row.companySize || "unknown",
    valueBucket: "medium",
    stageVelocityDays: 14,
    contactsEngaged: 1,
    meetingCount: 0,
    emailSentiment: "neutral",
    hasChampion: row.hasRecentFunding,
    hasCompetitor: row.techStackOverlap > 0,
  };
}

/**
 * Train a company-level scoring model from companies linked to
 * closed deals. Returns null when insufficient data.
 */
export function trainCompanyModel(
  rows: CompanyTrainingRow[],
): CompanyScoringModel | null {
  if (rows.length < 10) return null;

  const closedDealData: ClosedDealData[] = rows.map((row) => ({
    outcome: row.outcome,
    features: companyRowToFeatures(row),
  }));

  return trainScoringModel(closedDealData);
}
