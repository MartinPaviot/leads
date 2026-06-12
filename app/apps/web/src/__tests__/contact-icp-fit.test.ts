/**
 * Contact × ICP fit — pure parts. Locks the person-dimension contract:
 *   - person_seniorities IS evaluated (enum vs enum, norm-resilient);
 *   - person_titles IS evaluated WHEN a resolution is injected
 *     (title→persona, _specs/title-persona-fit); an uninjected title
 *     stays absent — no penalty; hiring_job_titles stays sourcing-only;
 *   - absent seniority leaves the denominator (no penalty);
 *   - the contact-scoped guard accepts people-only ICPs
 *     (seniorities-only or titles-only) the company-side guard rejects.
 */

import { describe, it, expect } from "vitest";
import { computeBlendedFit, COVERAGE_FLOOR } from "@/lib/icp/criteria-engine";
import {
  buildContactContext,
  CONTACT_SOURCING_ONLY,
  CONTACT_SCORABLE_PERSON_FIELDS,
  hasContactScorableCriteria,
} from "@/lib/scoring/contact-icp-fit";
import { SOURCING_ONLY_FIELD_KEYS } from "@/lib/icp/field-catalog";
import type { ActiveIcp } from "@/lib/icp/fit-recompute-core";

const seniorityCriterion = {
  id: "sen",
  fieldKey: "person_seniorities",
  operator: "in" as const,
  value: ["c_suite", "founder"],
  weight: 1,
  isRequired: false,
};
const titleCriterion = {
  id: "title",
  fieldKey: "person_titles",
  operator: "in" as const,
  value: ["ceo"],
  weight: 1,
  isRequired: false,
};
const industryCriterion = {
  id: "ind",
  fieldKey: "industry",
  operator: "eq" as const,
  value: "software",
  weight: 1,
  isRequired: false,
};

describe("CONTACT_SOURCING_ONLY", () => {
  it("excludes only hiring_job_titles — both person fields are scorable", () => {
    expect(CONTACT_SOURCING_ONLY.has("person_titles")).toBe(false);
    expect(CONTACT_SOURCING_ONLY.has("hiring_job_titles")).toBe(true);
    expect(CONTACT_SOURCING_ONLY.has("person_seniorities")).toBe(false);
    expect(CONTACT_SCORABLE_PERSON_FIELDS.has("person_titles")).toBe(true);
    // every contact-scorable person field comes out of the company set
    for (const k of CONTACT_SCORABLE_PERSON_FIELDS) {
      expect(SOURCING_ONLY_FIELD_KEYS.has(k)).toBe(true);
    }
  });
});

describe("buildContactContext", () => {
  it("adds person_seniorities from enriched properties", () => {
    const ctx = buildContactContext(
      { industry: "software" },
      { properties: { seniority: "c_suite" } },
    );
    expect(ctx.person_seniorities).toEqual(["c_suite"]);
    expect(ctx.industry).toBe("software");
  });

  it("leaves the key absent when seniority is missing or empty", () => {
    expect(buildContactContext({}, { properties: {} }).person_seniorities).toBeUndefined();
    expect(buildContactContext({}, { properties: { seniority: " " } }).person_seniorities).toBeUndefined();
    expect(buildContactContext({}, {}).person_seniorities).toBeUndefined();
  });
});

describe("computeBlendedFit with the contact sourcing set", () => {
  it("scores person_seniorities — separator/casing-resilient match", () => {
    const fit = computeBlendedFit(
      [seniorityCriterion, industryCriterion],
      { industry: "software", person_seniorities: ["C-Suite"] },
      CONTACT_SOURCING_ONLY,
    );
    // both soft criteria evaluable and matched → full fit, full coverage
    expect(fit.fitEvaluable).toBe(1);
    expect(fit.coverage).toBe(1);
    expect(fit.score01).toBe(1);
    expect(fit.matched).toContain("sen");
  });

  it("counts an evaluated non-matching seniority against the fit", () => {
    const fit = computeBlendedFit(
      [seniorityCriterion, industryCriterion],
      { industry: "software", person_seniorities: ["entry"] },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.fitEvaluable).toBe(0.5);
    expect(fit.unmatched).toContain("sen");
  });

  it("does not penalise a contact with no seniority data", () => {
    const fit = computeBlendedFit(
      [seniorityCriterion, industryCriterion],
      { industry: "software" },
      CONTACT_SOURCING_ONLY,
    );
    // seniority leaves the denominator; only coverage prices it in
    expect(fit.fitEvaluable).toBe(1);
    expect(fit.coverage).toBe(0.5);
    expect(fit.score01).toBeCloseTo(COVERAGE_FLOOR + 0.4 * 0.5, 5);
  });

  it("matches person_titles through an injected persona alias", () => {
    // The scorer injects [raw title, ...resolved personas]; the
    // criterion's `in` intersection then hits the alias.
    const fit = computeBlendedFit(
      [titleCriterion, industryCriterion],
      { industry: "software", person_titles: ["Directeur Général", "ceo"] },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.score01).toBe(1);
    expect(fit.matched).toContain("title");
  });

  it("counts a resolved-empty title against the fit (true non-match)", () => {
    const fit = computeBlendedFit(
      [titleCriterion, industryCriterion],
      { industry: "software", person_titles: ["Stagiaire RH"] },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.fitEvaluable).toBe(0.5);
    expect(fit.unmatched).toContain("title");
  });

  it("does not penalise an UNRESOLVED title (key absent — no injection)", () => {
    const fit = computeBlendedFit(
      [titleCriterion, industryCriterion],
      { industry: "software" },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.fitEvaluable).toBe(1);
    expect(fit.coverage).toBe(0.5);
    expect(fit.score01).toBeCloseTo(COVERAGE_FLOOR + 0.4 * 0.5, 5);
  });

  it("zeroes on a required title criterion that can't be verified (engine doctrine)", () => {
    const fit = computeBlendedFit(
      [{ ...titleCriterion, isRequired: true }, industryCriterion],
      { industry: "software" },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.score01).toBe(0);
    expect(fit.excludedBy).toBe("title");
  });

  it("still ignores hiring_job_titles entirely", () => {
    const hiring = { ...titleCriterion, id: "hiring", fieldKey: "hiring_job_titles" };
    const fit = computeBlendedFit(
      [hiring, industryCriterion],
      { industry: "software", hiring_job_titles: ["ceo"] },
      CONTACT_SOURCING_ONLY,
    );
    expect(fit.score01).toBe(1);
    expect(fit.matched).not.toContain("hiring");
    expect(fit.unmatched).not.toContain("hiring");
  });
});

describe("hasContactScorableCriteria", () => {
  const icp = (criteria: ActiveIcp["criteria"]): ActiveIcp => ({
    id: "i",
    name: "I",
    priority: 1,
    criteria,
  });

  it("accepts a seniorities-only people ICP", () => {
    expect(hasContactScorableCriteria([icp([seniorityCriterion])])).toBe(true);
  });

  it("accepts a titles-only people ICP; rejects empty shells", () => {
    expect(hasContactScorableCriteria([icp([titleCriterion])])).toBe(true);
    expect(hasContactScorableCriteria([icp([])])).toBe(false);
    expect(hasContactScorableCriteria([])).toBe(false);
  });

  it("accepts plain company criteria", () => {
    expect(hasContactScorableCriteria([icp([industryCriterion])])).toBe(true);
  });
});
