import { describe, it, expect } from "vitest";
import {
  ENRICHMENT_CRITERIA,
  ALL_CRITERIA_KEYS,
  BASE_CRITERIA_KEYS,
  getCriterion,
  listBaseCriteria,
  listExtraCriteria,
  resolveCriteria,
  fieldsForCriteria,
  hasEnrichmentValue,
  criterionPresent,
  evaluateCriterion,
} from "@/lib/providers/company-enrichment/criteria";
import { emptyCompany } from "@/lib/providers/company-enrichment/types";

describe("enrichment criteria registry", () => {
  it("declares the base set as the left-hand accounts columns", () => {
    expect([...BASE_CRITERIA_KEYS].sort()).toEqual(
      ["description", "geography", "industry", "linkedin", "revenue", "size"].sort(),
    );
  });

  it("declares the à-la-carte extras separately from the base", () => {
    expect(listExtraCriteria().map((c) => c.key).sort()).toEqual(
      ["foundedYear", "funding", "keywords", "technologies"].sort(),
    );
    // No criterion is both base and extra.
    const base = new Set(listBaseCriteria().map((c) => c.key));
    expect(listExtraCriteria().some((c) => base.has(c.key))).toBe(false);
  });

  it("keeps every key unique and resolvable", () => {
    expect(new Set(ALL_CRITERIA_KEYS).size).toBe(ENRICHMENT_CRITERIA.length);
    for (const key of ALL_CRITERIA_KEYS) {
      expect(getCriterion(key)?.key).toBe(key);
    }
    expect(getCriterion("does-not-exist")).toBeUndefined();
  });

  describe("resolveCriteria", () => {
    it("defaults to the base set when nothing is requested", () => {
      expect(resolveCriteria().map((c) => c.key)).toEqual([...BASE_CRITERIA_KEYS]);
      expect(resolveCriteria([]).map((c) => c.key)).toEqual([...BASE_CRITERIA_KEYS]);
      expect(resolveCriteria(null).map((c) => c.key)).toEqual([...BASE_CRITERIA_KEYS]);
    });

    it("returns requested criteria in catalog order", () => {
      // Requested out of order — output follows the catalog, not the input.
      expect(resolveCriteria(["funding", "industry"]).map((c) => c.key)).toEqual([
        "industry",
        "funding",
      ]);
    });

    it("drops unknown keys (defensive against stale clients)", () => {
      expect(resolveCriteria(["bogus", "revenue"]).map((c) => c.key)).toEqual(["revenue"]);
      expect(resolveCriteria(["bogus"]).map((c) => c.key)).toEqual([]);
    });
  });

  it("unions the touched EnrichedCompany fields", () => {
    const fields = fieldsForCriteria(resolveCriteria(["size", "geography"]));
    expect([...fields].sort()).toEqual(
      ["city", "country", "employeeCount", "sizeRange", "state"].sort(),
    );
  });

  describe("hasEnrichmentValue", () => {
    it("rejects empty / null-ish values", () => {
      expect(hasEnrichmentValue(null)).toBe(false);
      expect(hasEnrichmentValue(undefined)).toBe(false);
      expect(hasEnrichmentValue("")).toBe(false);
      expect(hasEnrichmentValue("   ")).toBe(false);
      expect(hasEnrichmentValue([])).toBe(false);
      expect(hasEnrichmentValue(Number.NaN)).toBe(false);
    });
    it("accepts real values", () => {
      expect(hasEnrichmentValue("Fintech")).toBe(true);
      expect(hasEnrichmentValue(0)).toBe(true);
      expect(hasEnrichmentValue(8000)).toBe(true);
      expect(hasEnrichmentValue(["React"])).toBe(true);
    });
  });

  it("treats a criterion as present when any of its fields holds a value", () => {
    const size = getCriterion("size")!;
    expect(criterionPresent(size, { ...emptyCompany() })).toBe(false);
    expect(criterionPresent(size, { ...emptyCompany(), employeeCount: 50 })).toBe(true);
    expect(criterionPresent(size, { ...emptyCompany(), sizeRange: "51-200" })).toBe(true);
  });

  describe("evaluateCriterion", () => {
    const revenue = getCriterion("revenue")!;
    const tech = getCriterion("technologies")!;

    it("reports already-present when the value pre-existed", () => {
      const before = { ...emptyCompany(), revenueRange: "$10M" };
      const after = { ...emptyCompany(), revenueRange: "$50M" };
      expect(evaluateCriterion(revenue, before, after)).toBe("already-present");
    });

    it("reports filled when empty before and populated after", () => {
      const before = { ...emptyCompany() };
      const after = { ...emptyCompany(), annualRevenue: 1_000_000 };
      expect(evaluateCriterion(revenue, before, after)).toBe("filled");
    });

    it("reports not-found when still empty after the run", () => {
      const before = { ...emptyCompany() };
      const after = { ...emptyCompany() };
      expect(evaluateCriterion(revenue, before, after)).toBe("not-found");
    });

    it("handles array-valued criteria (technologies)", () => {
      expect(evaluateCriterion(tech, { technologies: [] }, { technologies: ["React"] })).toBe(
        "filled",
      );
      expect(evaluateCriterion(tech, { technologies: ["Vue"] }, { technologies: ["Vue"] })).toBe(
        "already-present",
      );
      expect(evaluateCriterion(tech, { technologies: [] }, { technologies: [] })).toBe(
        "not-found",
      );
    });
  });
});
