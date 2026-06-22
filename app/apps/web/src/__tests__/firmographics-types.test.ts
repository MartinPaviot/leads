import { describe, it, expect } from "vitest";
import { EMPTY_FIRMOGRAPHICS, type FirmographicFacts } from "@/lib/campaign-engine/types";
import { pickFirmographics } from "@/lib/campaign-engine/sources/apollo-enrich";

// P1-10 T1 — guard against drift between FirmographicFacts, EMPTY_FIRMOGRAPHICS,
// and what pickFirmographics emits. If a field is added in one place but not the
// others, this test fails instead of silently dropping data at persistence time.
const EXPECTED_KEYS = [
  "industry", "description", "employeeCount", "sizeRange", "annualRevenue",
  "revenueRange", "foundedYear", "city", "state", "country", "fundingStage",
  "totalFunding", "investors", "technologies",
] as const;

describe("FirmographicFacts / EMPTY_FIRMOGRAPHICS parity", () => {
  it("EMPTY_FIRMOGRAPHICS covers exactly the 14 firmographic keys", () => {
    expect(Object.keys(EMPTY_FIRMOGRAPHICS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("zero value: scalars null, arrays empty", () => {
    for (const k of EXPECTED_KEYS) {
      const v = (EMPTY_FIRMOGRAPHICS as unknown as Record<string, unknown>)[k];
      if (k === "investors" || k === "technologies") expect(v).toEqual([]);
      else expect(v).toBeNull();
    }
  });

  it("pickFirmographics projects the same key set (drops raw)", () => {
    // Minimal EnrichedCompany-shaped input; pickFirmographics only reads the
    // firmographic fields. raw/source must NOT leak into the projection.
    const projected = pickFirmographics({
      domain: "x.com", name: "X", industry: "SaaS", description: null,
      employeeCount: 10, sizeRange: null, annualRevenue: null, revenueRange: null,
      foundedYear: null, city: null, state: null, country: null, fundingStage: null,
      totalFunding: null, investors: [], technologies: [],
      // fields outside the firmographic subset that must be dropped:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: { secret: 1 }, logoUrl: "x",
    } as any);
    expect(Object.keys(projected).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect((projected as unknown as Record<string, unknown>).raw).toBeUndefined();
    // type-level: the object IS a FirmographicFacts
    const _typed: FirmographicFacts = projected;
    expect(_typed.employeeCount).toBe(10);
  });
});
