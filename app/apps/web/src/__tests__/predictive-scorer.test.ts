/**
 * Tests for the Bayesian predictive deal scorer.
 *
 * Tests the Naive Bayes model training, deal scoring, and value
 * bucketing without any external dependencies. All math is pure
 * functions operating on in-memory data.
 */

import { describe, it, expect } from "vitest";
import {
  trainScoringModel,
  scoreDeal,
  valueToBucket,
  type ClosedDealData,
  type DealFeatures,
  type ScoringModel,
} from "@/lib/scoring/predictive-scorer";

// ── Helpers ──────────────────────────────────────────────────

function makeFeatures(overrides?: Partial<DealFeatures>): DealFeatures {
  return {
    industry: "saas",
    companySize: "mid-market",
    valueBucket: "medium",
    stageVelocityDays: 14,
    contactsEngaged: 2,
    meetingCount: 3,
    emailSentiment: "positive",
    hasChampion: true,
    hasCompetitor: false,
    ...overrides,
  };
}

function makeDeal(
  outcome: "won" | "lost",
  overrides?: Partial<DealFeatures>,
): ClosedDealData {
  return { outcome, features: makeFeatures(overrides) };
}

/**
 * Build a mixed dataset of won and lost deals with varying features
 * to produce a meaningful model with enough sample size.
 */
function buildTrainingData(): ClosedDealData[] {
  return [
    // Won deals — SaaS, mid-market, positive, champion, no competitor
    makeDeal("won", { industry: "saas", companySize: "mid-market", emailSentiment: "positive", hasChampion: true, hasCompetitor: false }),
    makeDeal("won", { industry: "saas", companySize: "enterprise", emailSentiment: "positive", hasChampion: true, hasCompetitor: false }),
    makeDeal("won", { industry: "fintech", companySize: "mid-market", emailSentiment: "positive", hasChampion: true, hasCompetitor: true }),
    makeDeal("won", { industry: "saas", companySize: "startup", emailSentiment: "neutral", hasChampion: true, hasCompetitor: false, meetingCount: 5 }),
    makeDeal("won", { industry: "saas", companySize: "mid-market", emailSentiment: "positive", hasChampion: false, hasCompetitor: false, valueBucket: "large" }),
    makeDeal("won", { industry: "healthtech", companySize: "mid-market", emailSentiment: "positive", hasChampion: true, hasCompetitor: false }),

    // Lost deals — varied, negative sentiment, competitors
    makeDeal("lost", { industry: "retail", companySize: "enterprise", emailSentiment: "negative", hasChampion: false, hasCompetitor: true }),
    makeDeal("lost", { industry: "saas", companySize: "enterprise", emailSentiment: "negative", hasChampion: false, hasCompetitor: true }),
    makeDeal("lost", { industry: "retail", companySize: "mid-market", emailSentiment: "negative", hasChampion: false, hasCompetitor: true, stageVelocityDays: 60 }),
    makeDeal("lost", { industry: "manufacturing", companySize: "enterprise", emailSentiment: "neutral", hasChampion: false, hasCompetitor: true, meetingCount: 0 }),
  ];
}

// ── valueToBucket ────────────────────────────────────────────

describe("valueToBucket", () => {
  it("maps null/undefined/zero to 'small'", () => {
    expect(valueToBucket(null)).toBe("small");
    expect(valueToBucket(undefined)).toBe("small");
    expect(valueToBucket(0)).toBe("small");
    expect(valueToBucket(-100)).toBe("small");
  });

  it("maps values < 5000 to 'small'", () => {
    expect(valueToBucket(1)).toBe("small");
    expect(valueToBucket(4999)).toBe("small");
  });

  it("maps values 5000-24999 to 'medium'", () => {
    expect(valueToBucket(5000)).toBe("medium");
    expect(valueToBucket(15000)).toBe("medium");
    expect(valueToBucket(24999)).toBe("medium");
  });

  it("maps values 25000-99999 to 'large'", () => {
    expect(valueToBucket(25000)).toBe("large");
    expect(valueToBucket(50000)).toBe("large");
    expect(valueToBucket(99999)).toBe("large");
  });

  it("maps values >= 100000 to 'enterprise'", () => {
    expect(valueToBucket(100000)).toBe("enterprise");
    expect(valueToBucket(500000)).toBe("enterprise");
    expect(valueToBucket(10_000_000)).toBe("enterprise");
  });
});

// ── trainScoringModel ────────────────────────────────────────

describe("trainScoringModel", () => {
  it("returns valid model with empty array (prior 0.5)", () => {
    const model = trainScoringModel([]);
    expect(model.priorWinRate).toBe(0.5);
    expect(model.sampleSize).toBe(0);
    expect(model.featureWeights).toEqual({});
    expect(model.trainedAt).toBeTruthy();
  });

  it("computes correct prior with all wins", () => {
    const allWins = [
      makeDeal("won"),
      makeDeal("won"),
      makeDeal("won"),
    ];
    const model = trainScoringModel(allWins);
    expect(model.priorWinRate).toBe(1.0);
    expect(model.sampleSize).toBe(3);
  });

  it("computes correct prior with all losses", () => {
    const allLosses = [
      makeDeal("lost"),
      makeDeal("lost"),
    ];
    const model = trainScoringModel(allLosses);
    expect(model.priorWinRate).toBe(0);
    expect(model.sampleSize).toBe(2);
  });

  it("computes correct prior with mixed outcomes", () => {
    const data = buildTrainingData(); // 6 won, 4 lost
    const model = trainScoringModel(data);
    expect(model.priorWinRate).toBe(0.6); // 6/10
    expect(model.sampleSize).toBe(10);
  });

  it("populates feature weights for all feature categories", () => {
    const data = buildTrainingData();
    const model = trainScoringModel(data);

    // All 9 feature categories should be present
    const expectedFeatures = [
      "industry",
      "companySize",
      "valueBucket",
      "stageVelocity",
      "contactsEngaged",
      "meetingCount",
      "emailSentiment",
      "hasChampion",
      "hasCompetitor",
    ];
    for (const f of expectedFeatures) {
      expect(model.featureWeights[f]).toBeDefined();
    }
  });

  it("tracks win/loss counts per feature value correctly", () => {
    const data = buildTrainingData();
    const model = trainScoringModel(data);

    // "positive" sentiment: 5 wins (all positive-sentiment won deals), 0 losses
    const positiveSentiment = model.featureWeights["emailSentiment"]?.["positive"];
    expect(positiveSentiment).toBeDefined();
    expect(positiveSentiment!.wins).toBeGreaterThan(0);

    // "negative" sentiment: 0 wins, 3 losses
    const negativeSentiment = model.featureWeights["emailSentiment"]?.["negative"];
    expect(negativeSentiment).toBeDefined();
    expect(negativeSentiment!.losses).toBeGreaterThan(0);
    expect(negativeSentiment!.wins).toBe(0);
  });

  it("stores trainedAt as ISO timestamp", () => {
    const model = trainScoringModel([makeDeal("won")]);
    expect(() => new Date(model.trainedAt)).not.toThrow();
    expect(new Date(model.trainedAt).getTime()).not.toBeNaN();
  });
});

// ── scoreDeal ────────────────────────────────────────────────

describe("scoreDeal", () => {
  it("returns prior with insufficient data disclaimer when sampleSize < 5", () => {
    const smallModel = trainScoringModel([
      makeDeal("won"),
      makeDeal("lost"),
    ]);
    const result = scoreDeal(makeFeatures(), smallModel);
    expect(result.probability).toBe(smallModel.priorWinRate);
    expect(result.topFactors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Insufficient historical data"),
      ]),
    );
  });

  it("scores a deal with features matching common win patterns higher", () => {
    const model = trainScoringModel(buildTrainingData());

    // Features that match the typical won-deal profile
    const winLikely = makeFeatures({
      industry: "saas",
      companySize: "mid-market",
      emailSentiment: "positive",
      hasChampion: true,
      hasCompetitor: false,
    });

    const result = scoreDeal(winLikely, model);
    expect(result.probability).toBeGreaterThan(0.5);
    expect(result.topFactors.length).toBeLessThanOrEqual(3);
    expect(result.topFactors.length).toBeGreaterThanOrEqual(1);
  });

  it("scores a deal with features matching common loss patterns lower", () => {
    const model = trainScoringModel(buildTrainingData());

    // Features that match the typical lost-deal profile
    const lossLikely = makeFeatures({
      industry: "retail",
      companySize: "enterprise",
      emailSentiment: "negative",
      hasChampion: false,
      hasCompetitor: true,
      meetingCount: 0,
      stageVelocityDays: 60,
    });

    const result = scoreDeal(lossLikely, model);
    expect(result.probability).toBeLessThan(0.5);
  });

  it("probability is clamped between 0.01 and 0.99", () => {
    const extremeModel = trainScoringModel([
      ...Array(20).fill(null).map(() => makeDeal("won")),
      makeDeal("lost", { industry: "niche" }),
    ]);

    // Score with perfect win profile
    const result = scoreDeal(makeFeatures(), extremeModel);
    expect(result.probability).toBeLessThanOrEqual(0.99);
    expect(result.probability).toBeGreaterThanOrEqual(0.01);
  });

  it("returns top 3 factors sorted by influence magnitude", () => {
    const model = trainScoringModel(buildTrainingData());
    const result = scoreDeal(makeFeatures(), model);

    expect(result.topFactors).toHaveLength(3);
    // Each factor should have a human-readable format: "Label: value (+/-)"
    for (const factor of result.topFactors) {
      expect(factor).toMatch(/.+: .+ \([+-]\)/);
    }
  });

  it("handles unseen feature values gracefully via Laplace smoothing", () => {
    const model = trainScoringModel(buildTrainingData());

    // Use a feature value never seen in training data
    const unseenFeatures = makeFeatures({
      industry: "aerospace_defense_unusual",
      companySize: "mega_corp_unusual",
    });

    // Should not throw — Laplace smoothing handles unseen values
    const result = scoreDeal(unseenFeatures, model);
    expect(result.probability).toBeGreaterThanOrEqual(0.01);
    expect(result.probability).toBeLessThanOrEqual(0.99);
    expect(result.topFactors.length).toBeGreaterThanOrEqual(1);
  });

  it("win-likely vs loss-likely scores have expected ordering", () => {
    const model = trainScoringModel(buildTrainingData());

    const winProfile = makeFeatures({
      emailSentiment: "positive",
      hasChampion: true,
      hasCompetitor: false,
    });
    const lossProfile = makeFeatures({
      emailSentiment: "negative",
      hasChampion: false,
      hasCompetitor: true,
    });

    const winScore = scoreDeal(winProfile, model);
    const lossScore = scoreDeal(lossProfile, model);

    expect(winScore.probability).toBeGreaterThan(lossScore.probability);
  });
});
