import { describe, it, expect } from "vitest";
import {
  nafForIndustries,
  isFrenchRegion,
  frenchRegions,
  employeeRangeToTranches,
  SOFTWARE_NAF,
} from "@/lib/integrations/pappers-codes";
import { criteriaToPappersParams } from "@/lib/icp/to-pappers-params";
import type { Criterion } from "@/lib/icp/criteria-engine";

function crit(p: Partial<Criterion> & Pick<Criterion, "fieldKey" | "operator" | "value">): Criterion {
  return { id: `${p.fieldKey}`, weight: p.weight ?? 1, isRequired: p.isRequired ?? false, ...p };
}

describe("nafForIndustries", () => {
  it("maps software / IT / internet labels to NAF codes", () => {
    const naf = nafForIndustries(["Computer Software", "Information Technology and Services", "Internet"]);
    expect(naf).toContain("58.29C"); // édition de logiciels applicatifs
    expect(naf).toContain("62.01Z"); // programmation
    expect(naf).toContain("63.12Z"); // portails internet
  });
  it("maps finance labels", () => {
    expect(nafForIndustries(["Financial Services"])).toContain("64.19Z");
  });
  it("is accent/case insensitive and ignores unknowns", () => {
    expect(nafForIndustries(["computer software"]).length).toBeGreaterThan(0);
    expect(nafForIndustries(["Pottery"])).toEqual([]);
  });
});

describe("French region gating", () => {
  it("recognises FR regions, rejects Swiss cantons", () => {
    expect(isFrenchRegion("Île-de-France")).toBe(true);
    expect(isFrenchRegion("ile-de-france")).toBe(true); // accent/case insensitive
    expect(isFrenchRegion("Auvergne-Rhône-Alpes")).toBe(true);
    expect(isFrenchRegion("Vaud")).toBe(false);
    expect(isFrenchRegion("Geneva")).toBe(false);
  });
  it("filters a mixed geography to French regions only", () => {
    expect(
      frenchRegions(["Vaud", "Geneva", "Île-de-France", "Occitanie", "Zurich"]),
    ).toEqual(["Île-de-France", "Occitanie"]);
  });
});

describe("employeeRangeToTranches (INSEE)", () => {
  it("50-150 → tranches 21 (50-99) + 22 (100-199)", () => {
    expect(employeeRangeToTranches(50, 150)).toEqual(["21", "22"]);
  });
  it("30-150 → adds 12 (20-49)", () => {
    expect(employeeRangeToTranches(30, 150)).toEqual(["12", "21", "22"]);
  });
  it("open-ended max reaches the top tranche", () => {
    expect(employeeRangeToTranches(5000, null)).toContain("53");
  });
});

describe("criteriaToPappersParams", () => {
  it("translates an ICP-1-like (FR+CH) criteria set, keeping only FR regions", () => {
    const t = criteriaToPappersParams([
      crit({ fieldKey: "geography", operator: "in", value: ["Vaud", "Geneva", "Île-de-France", "Occitanie"] }),
      crit({ fieldKey: "industry", operator: "in", value: ["Computer Software", "Internet"] }),
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 50, max: 150 } }),
    ]);
    expect(t.ok).toBe(true);
    expect(t.params.region).toEqual(["Île-de-France", "Occitanie"]);
    expect(t.params.code_naf).toContain("58.29C");
    expect(t.params.tranche_effectif).toEqual(["21", "22"]);
  });

  it("returns ok:false for a Swiss-only ICP (Pappers is France-only)", () => {
    const t = criteriaToPappersParams([
      crit({ fieldKey: "geography", operator: "in", value: ["Geneva", "Vaud", "Zug", "Zurich"] }),
      crit({ fieldKey: "industry", operator: "in", value: ["Financial Services"] }),
    ]);
    expect(t.ok).toBe(false);
    expect(t.reason).toMatch(/France-only/);
  });

  it("SOFTWARE_NAF is the éditeur-logiciel set", () => {
    expect(SOFTWARE_NAF).toContain("58.29C");
    expect(SOFTWARE_NAF).toContain("62.01Z");
  });
});
