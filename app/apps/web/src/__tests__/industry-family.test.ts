import { describe, it, expect } from "vitest";
import {
  familiesToIndustries,
  familyCounts,
  FAMILY_KEYS,
  FAMILY_LABELS,
} from "@/lib/search/industry-family-util";
import type { IndustryFamily } from "@/lib/ui/industry-style";

// Note: the LLM classifier (classifyIndustryFamilies) lives in industry-family.ts
// and is verified live against the DB — importing it here would pull the AI SDK,
// which trips a local-only vitest flake. These cover the pure rollup helpers.

describe("FAMILY_KEYS / FAMILY_LABELS", () => {
  it("exposes the 14 families with a label each", () => {
    expect(FAMILY_KEYS.length).toBe(14);
    for (const k of FAMILY_KEYS) expect(FAMILY_LABELS[k].length).toBeGreaterThan(0);
    expect(FAMILY_KEYS).toContain("health");
    expect(FAMILY_KEYS).toContain("public");
    expect(FAMILY_KEYS).toContain("nonprofit");
  });
});

describe("familiesToIndustries", () => {
  const map: Record<string, IndustryFamily> = {
    "hospital & health care": "health",
    "higher education": "education",
    banking: "finance",
    "nonprofit organization management": "nonprofit",
  };
  it("returns the industries whose family is selected (verbatim)", () => {
    expect(familiesToIndustries(map, ["health"]).sort()).toEqual(["hospital & health care"]);
    expect(familiesToIndustries(map, ["health", "education"]).sort()).toEqual([
      "higher education",
      "hospital & health care",
    ]);
  });
  it("returns nothing for an unselected/unknown family or empty selection", () => {
    expect(familiesToIndustries(map, ["transport"])).toEqual([]);
    expect(familiesToIndustries(map, [])).toEqual([]);
  });
});

describe("familyCounts", () => {
  it("rolls per-industry counts up into per-family counts; drops unmapped", () => {
    const map: Record<string, IndustryFamily> = {
      "hospital & health care": "health",
      "medical devices": "health",
      banking: "finance",
    };
    const counts = { "hospital & health care": 37, "medical devices": 5, banking: 50, "unmapped industry": 9 };
    expect(familyCounts(map, counts)).toEqual({ health: 42, finance: 50 });
  });
});
