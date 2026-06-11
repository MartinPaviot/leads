import { describe, it, expect } from "vitest";
import {
  computeBlendedFit,
  COVERAGE_FLOOR,
  COVERAGE_SPAN,
  type Criterion,
  type CompanyContext,
} from "@/lib/icp/criteria-engine";

/**
 * Locks the worked examples of _specs/icp-unification design.md §2.
 * The fixture mirrors the real (since deleted) Pilae profile that
 * zeroed half the prod book under the penalizing engine: geography
 * required + 5 scorable soft criteria (weights 3/2/1/1/3 = 10) + 2
 * person_* criteria the company context can never satisfy.
 */

function c(
  id: string,
  fieldKey: string,
  operator: Criterion["operator"],
  value: unknown,
  weight = 1,
  isRequired = false,
): Criterion {
  return { id, fieldKey, operator, value, weight, isRequired };
}

const CRITERIA: Criterion[] = [
  c("geo", "geography", "in", ["Vaud", "Geneva", "Île-de-France"], 1, true),
  c("emp", "employee_count", "between", { min: 50, max: 150 }, 3),
  c("ind", "industry", "in", ["Computer Software", "Information Technology and Services"], 2),
  c("kw", "keywords", "in", ["SaaS", "B2B"], 1),
  c("fund", "latest_funding_stage", "in", ["seed", "series_a"], 1),
  c("tech", "technologies", "in", ["Datadog", "Okta"], 3),
  // Sourcing-only — must be ignored entirely by the company fit.
  c("psen", "person_seniorities", "in", ["c_suite"], 1),
  c("ptit", "person_titles", "in", ["CTO"], 1),
];

const REGISTRY_CTX: CompanyContext = {
  geography: ["Vaud", "Switzerland"],
  employee_count: 100,
  industry: "Computer Software",
};

const ENRICHED_TECH_MISS_CTX: CompanyContext = {
  ...REGISTRY_CTX,
  keywords: ["SaaS"],
  latest_funding_stage: "Seed",
  technologies: ["WordPress"],
};

describe("computeBlendedFit — design.md §2 worked examples", () => {
  it("registry company (sector+size+geo only): perfect fit on half coverage → 0.8 (mirror 80, was 0 before)", () => {
    const fit = computeBlendedFit(CRITERIA, REGISTRY_CTX);
    expect(fit.excludedBy).toBeNull();
    expect(fit.fitEvaluable).toBe(1);
    expect(fit.coverage).toBeCloseTo(0.5, 10); // 5 evaluable of 10 scorable soft weight
    expect(fit.score01).toBeCloseTo(0.8, 10);
    expect(Math.round(100 * fit.score01)).toBe(80);
    expect(fit.identityFit).toBe(1);
    expect(fit.signalFit).toBe(0); // no signal data → nothing to claim
  });

  it("fully enriched, tech mismatch: 7/10 on full coverage → 0.7 (mirror 70)", () => {
    const fit = computeBlendedFit(CRITERIA, ENRICHED_TECH_MISS_CTX);
    expect(fit.coverage).toBeCloseTo(1, 10);
    expect(fit.fitEvaluable).toBeCloseTo(0.7, 10);
    expect(fit.score01).toBeCloseTo(0.7, 10);
    expect(Math.round(100 * fit.score01)).toBe(70);
    expect(fit.unmatched).toContain("tech");
  });

  it("fully enriched, all matched → 1.0 (mirror 100, was capped 0.83 before)", () => {
    const fit = computeBlendedFit(CRITERIA, {
      ...ENRICHED_TECH_MISS_CTX,
      technologies: ["Datadog", "Snowflake"],
    });
    expect(fit.score01).toBeCloseTo(1, 10);
    expect(Math.round(100 * fit.score01)).toBe(100);
  });

  it("required geography fails → 0 with excludedBy, regardless of soft matches", () => {
    const fit = computeBlendedFit(CRITERIA, { ...ENRICHED_TECH_MISS_CTX, geography: ["Bern"] });
    expect(fit.score01).toBe(0);
    expect(fit.excludedBy).toBe("geo");
  });

  it("sourcing-only person_* criteria never appear in matched/unmatched nor dilute coverage", () => {
    const fit = computeBlendedFit(CRITERIA, REGISTRY_CTX);
    const seen = [...fit.matched, ...fit.unmatched];
    expect(seen).not.toContain("psen");
    expect(seen).not.toContain("ptit");
    // Coverage denominator is 10 (scorable soft), not 12.
    expect(fit.coverage).toBeCloseTo(0.5, 10);
  });
});

describe("computeBlendedFit — locked edge cases", () => {
  it("required-only ICP, all matched → 1.0 (parity with computeIcpFit)", () => {
    const fit = computeBlendedFit(
      [c("geo", "geography", "in", ["Vaud"], 1, true)],
      { geography: ["Vaud"] },
    );
    expect(fit.score01).toBe(1);
    expect(fit.coverage).toBe(1);
  });

  it("soft criteria exist but none evaluable, required matched → COVERAGE_FLOOR", () => {
    const fit = computeBlendedFit(
      [c("geo", "geography", "in", ["Vaud"], 1, true), c("tech", "technologies", "in", ["Okta"], 3)],
      { geography: ["Vaud"] },
    );
    expect(fit.fitEvaluable).toBe(1);
    expect(fit.coverage).toBe(0);
    expect(fit.score01).toBeCloseTo(COVERAGE_FLOOR, 10);
  });

  it("no required, nothing evaluable → 0 (R2.5: no fabricated confidence)", () => {
    const fit = computeBlendedFit([c("tech", "technologies", "in", ["Okta"], 3)], {});
    expect(fit.score01).toBe(0);
    expect(fit.fitEvaluable).toBe(0);
  });

  it("people-only ICP has no scorable criteria → 0", () => {
    const fit = computeBlendedFit(
      [c("psen", "person_seniorities", "in", ["c_suite"], 1), c("ptit", "person_titles", "in", ["CTO"], 1)],
      { industry: "Banking" },
    );
    expect(fit.score01).toBe(0);
    expect(fit.matched).toHaveLength(0);
    expect(fit.unmatched).toHaveLength(0);
  });

  it("blend constants: score01 = fitEvaluable × (FLOOR + SPAN × coverage)", () => {
    const fit = computeBlendedFit(CRITERIA, REGISTRY_CTX);
    expect(fit.score01).toBeCloseTo(
      fit.fitEvaluable * (COVERAGE_FLOOR + COVERAGE_SPAN * fit.coverage),
      10,
    );
  });
});
