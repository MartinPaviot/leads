import { describe, it, expect } from "vitest";
import { scoreCompanyWithModel } from "@/lib/scoring/company-scorer";
import {
  trainCompanyModel,
  type CompanyTrainingRow,
} from "@/lib/scoring/company-model-trainer";

describe("scoreCompanyWithModel", () => {
  const company = { industry: "Computer Software", name: "Acme", size: "51-200" };
  const props = {
    employee_count: 100,
    country: "United States",
    latest_funding_stage: "Series A",
    latest_funding_raised_at: "2026-03-01",
    technologies: ["React", "AWS"],
  };
  const icp = {
    industries: ["Computer Software"],
    sizeRange: [50, 500] as [number, number],
    geographies: ["United States"],
  };

  it("falls back to rules when no model", () => {
    const result = scoreCompanyWithModel(company, props, icp, null);
    expect(result.source).toBe("rules");
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("falls back to rules when model has < 10 samples", () => {
    const tinyModel = {
      priorWinRate: 0.5,
      featureWeights: {},
      trainedAt: new Date().toISOString(),
      sampleSize: 5,
    };
    const result = scoreCompanyWithModel(company, props, icp, tinyModel);
    expect(result.source).toBe("rules");
  });

  it("uses model when >= 10 samples", () => {
    const rows: CompanyTrainingRow[] = [];
    for (let i = 0; i < 8; i++) {
      rows.push({
        outcome: "won",
        industry: "computer software",
        companySize: "51-200",
        country: "united states",
        fundingStage: "series a",
        hasRecentFunding: true,
        techStackOverlap: 3,
      });
    }
    for (let i = 0; i < 4; i++) {
      rows.push({
        outcome: "lost",
        industry: "healthcare",
        companySize: "1000+",
        country: "japan",
        fundingStage: "none",
        hasRecentFunding: false,
        techStackOverlap: 0,
      });
    }
    const model = trainCompanyModel(rows);
    expect(model).not.toBeNull();

    const result = scoreCompanyWithModel(company, props, icp, model!);
    expect(result.source).toBe("model");
    expect(result.score).toBeGreaterThan(50);
    expect(result.reasons[0]).toContain("Learned from");
  });

  it("scores ICP-matching companies higher than non-matching", () => {
    const rows: CompanyTrainingRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push({
        outcome: "won",
        industry: "saas",
        companySize: "51-200",
        country: "united states",
        fundingStage: "series a",
        hasRecentFunding: true,
        techStackOverlap: 2,
      });
    }
    for (let i = 0; i < 10; i++) {
      rows.push({
        outcome: "lost",
        industry: "manufacturing",
        companySize: "1000+",
        country: "china",
        fundingStage: "none",
        hasRecentFunding: false,
        techStackOverlap: 0,
      });
    }
    const model = trainCompanyModel(rows)!;

    const goodCompany = { industry: "SaaS", name: "GoodCo", size: "51-200" };
    const goodProps = {
      country: "United States",
      latest_funding_stage: "Series A",
      latest_funding_raised_at: "2026-01-15",
      technologies: ["React"],
    };

    const badCompany = { industry: "Manufacturing", name: "BadCo", size: "1000+" };
    const badProps = {
      country: "China",
      latest_funding_stage: "none",
      technologies: [],
    };

    const goodScore = scoreCompanyWithModel(goodCompany, goodProps, undefined, model);
    const badScore = scoreCompanyWithModel(badCompany, badProps, undefined, model);

    expect(goodScore.score).toBeGreaterThan(badScore.score);
  });

  it("handles empty company gracefully", () => {
    const result = scoreCompanyWithModel({}, {}, undefined, null);
    expect(result.source).toBe("rules");
    expect(result.score).toBe(0);
  });
});
