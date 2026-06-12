/**
 * Contact × ICP fit — pure parts. Locks the person-dimension contract:
 *   - person_seniorities IS evaluated (enum vs enum, norm-resilient);
 *   - person_titles / hiring_job_titles stay sourcing-only (free-text
 *     persona labels can't be honestly string-matched against real
 *     titles — see lib/scoring/contact-icp-fit.ts header);
 *   - absent seniority leaves the denominator (no penalty);
 *   - the contact-scoped guard accepts a seniorities-only "people ICP"
 *     that the company-side guard would reject.
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
  it("excludes titles/hiring but NOT person_seniorities", () => {
    expect(CONTACT_SOURCING_ONLY.has("person_titles")).toBe(true);
    expect(CONTACT_SOURCING_ONLY.has("hiring_job_titles")).toBe(true);
    expect(CONTACT_SOURCING_ONLY.has("person_seniorities")).toBe(false);
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

  it("still ignores person_titles entirely", () => {
    const fit = computeBlendedFit(
      [titleCriterion, industryCriterion],
      { industry: "software", person_titles: ["Directeur Général"] },
      CONTACT_SOURCING_ONLY,
    );
    // title neither gates nor scores nor counts in coverage
    expect(fit.score01).toBe(1);
    expect(fit.matched).not.toContain("title");
    expect(fit.unmatched).not.toContain("title");
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

  it("rejects a titles-only ICP and empty shells", () => {
    expect(hasContactScorableCriteria([icp([titleCriterion])])).toBe(false);
    expect(hasContactScorableCriteria([icp([])])).toBe(false);
    expect(hasContactScorableCriteria([])).toBe(false);
  });

  it("accepts plain company criteria", () => {
    expect(hasContactScorableCriteria([icp([industryCriterion])])).toBe(true);
  });
});
