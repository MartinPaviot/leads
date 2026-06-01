import { describe, expect, it } from "vitest";
import { icpToStrategy, icpToSignalIcp } from "@/lib/icp/icp-to-tam";
import type { Criterion } from "@/lib/icp/criteria-engine";

function crit(p: Partial<Criterion> & Pick<Criterion, "fieldKey" | "operator">): Criterion {
  return { id: p.id ?? `${p.fieldKey}`, value: p.value ?? null, weight: p.weight ?? 1, isRequired: p.isRequired ?? false, ...p };
}

describe("icpToStrategy", () => {
  it("builds a strategy from apollo_search criteria", () => {
    const s = icpToStrategy("SaaS / Tech", [
      crit({ fieldKey: "industry", operator: "in", value: ["Computer Software"] }),
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 51, max: 200 } }),
      crit({ fieldKey: "geography", operator: "in", value: ["France"] }),
    ]);
    expect(s).not.toBeNull();
    expect(s?.label).toBe("ICP: SaaS / Tech");
    expect(s?.filters.q_organization_keyword_tags).toEqual(["Computer Software"]);
    expect(s?.filters.organization_num_employees_ranges).toEqual(["51,200"]);
    expect(s?.filters.organization_locations).toEqual(["France"]);
  });

  it("returns null when the ICP has no apollo_search criteria (avoid unfiltered search)", () => {
    const s = icpToStrategy("Custom-only", [
      crit({ fieldKey: "founded_year", operator: "gte", value: 2018 }), // apollo_enrich
      crit({ fieldKey: "properties.nb_avocats", operator: "gte", value: 5 }), // custom
    ]);
    expect(s).toBeNull();
  });

  it("returns null for an empty criteria list", () => {
    expect(icpToStrategy("Empty", [])).toBeNull();
  });
});

describe("icpToSignalIcp", () => {
  it("extracts industries / sizeRange / geographies from criteria", () => {
    const ctx = icpToSignalIcp([
      crit({ fieldKey: "industry", operator: "in", value: ["SaaS", "Fintech"] }),
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 50, max: 500 } }),
      crit({ fieldKey: "geography", operator: "in", value: ["France", "Switzerland"] }),
    ]);
    expect(ctx.industries).toEqual(["SaaS", "Fintech"]);
    expect(ctx.sizeRange).toEqual([50, 500]);
    expect(ctx.geographies).toEqual(["France", "Switzerland"]);
  });

  it("open-ended employee_count between → [min, BIG]", () => {
    const ctx = icpToSignalIcp([
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 1000 } }),
    ]);
    expect(ctx.sizeRange?.[0]).toBe(1000);
    expect(ctx.sizeRange?.[1]).toBeGreaterThan(100000);
  });

  it("gte employee_count → [n, BIG]", () => {
    const ctx = icpToSignalIcp([
      crit({ fieldKey: "employee_count", operator: "gte", value: 200 }),
    ]);
    expect(ctx.sizeRange?.[0]).toBe(200);
  });

  it("lte employee_count → [0, n]", () => {
    const ctx = icpToSignalIcp([
      crit({ fieldKey: "employee_count", operator: "lte", value: 50 }),
    ]);
    expect(ctx.sizeRange).toEqual([0, 50]);
  });

  it("omits fields the ICP doesn't constrain", () => {
    const ctx = icpToSignalIcp([
      crit({ fieldKey: "industry", operator: "in", value: ["SaaS"] }),
    ]);
    expect(ctx.industries).toEqual(["SaaS"]);
    expect(ctx.sizeRange).toBeUndefined();
    expect(ctx.geographies).toBeUndefined();
  });

  it("returns an empty object for criteria with no firmographic fields", () => {
    expect(icpToSignalIcp([crit({ fieldKey: "founded_year", operator: "gte", value: 2018 })])).toEqual({});
  });
});
