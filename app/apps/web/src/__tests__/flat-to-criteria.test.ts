import { describe, it, expect, beforeEach } from "vitest";
import {
  personaIcpToCriteria,
  sizesToEnvelope,
  __resetCriteriaIdCounter,
} from "@/lib/icp/flat-to-criteria";

describe("sizesToEnvelope", () => {
  it("collapses disjoint ranges to a min-max envelope", () => {
    expect(sizesToEnvelope(["11-50", "201-500"])).toEqual({ min: 11, max: 500 });
  });
  it("lets the open top band dominate the max", () => {
    expect(sizesToEnvelope(["10001+"])).toEqual({ min: 10001, max: null });
  });
  it("returns null for none", () => {
    expect(sizesToEnvelope([])).toBeNull();
  });
});

describe("personaIcpToCriteria", () => {
  beforeEach(() => __resetCriteriaIdCounter());

  it("maps persona fields onto the canonical criteria the build sources", () => {
    const c = personaIcpToCriteria({
      industries: ["computer software"],
      geographies: ["France"],
      technologies: ["AWS"],
      companySizes: ["51-200"],
    });
    const byField = Object.fromEntries(c.map((x) => [x.fieldKey, x]));
    expect(byField.industry.operator).toBe("in");
    expect(byField.industry.value).toEqual(["computer software"]);
    expect(byField.geography.value).toEqual(["France"]);
    // canonical fieldKey is plural "technologies"
    expect(byField.technologies.value).toEqual(["AWS"]);
    expect(byField.employee_count.operator).toBe("between");
    expect(byField.employee_count.value).toEqual({ min: 51, max: 200 });
  });

  it("returns [] for an empty ICP", () => {
    expect(personaIcpToCriteria({})).toEqual([]);
  });
});
