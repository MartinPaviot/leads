import { describe, it, expect } from "vitest";
import {
  departementsForRegion,
  departementsForRegions,
  isFrenchRegionName,
  regionNameForDepartement,
} from "@/lib/integrations/fr-departments";

describe("fr-departments", () => {
  it("maps a region to its départements (accent/case-insensitive)", () => {
    expect(departementsForRegion("Île-de-France")).toContain("75");
    expect(departementsForRegion("Île-de-France")).toContain("92");
    expect(departementsForRegion("ile de france")).toContain("75");
    expect(departementsForRegion("Occitanie")).toContain("31");
  });
  it("unions regions and drops non-French (Swiss) values", () => {
    const d = departementsForRegions(["Île-de-France", "Occitanie", "Vaud", "Geneva"]);
    expect(d).toContain("75");
    expect(d).toContain("31");
    // Vaud/Geneva are Swiss → no départements contributed
    expect(departementsForRegion("Vaud")).toEqual([]);
  });
  it("recognises French region names only", () => {
    expect(isFrenchRegionName("Nouvelle-Aquitaine")).toBe(true);
    expect(isFrenchRegionName("Auvergne-Rhône-Alpes")).toBe(true);
    expect(isFrenchRegionName("Zug")).toBe(false);
  });
  it("maps a département back to its (pretty) region name", () => {
    expect(regionNameForDepartement("75")).toBe("Île-de-France");
    expect(regionNameForDepartement("69")).toBe("Auvergne-Rhône-Alpes");
    expect(regionNameForDepartement("31")).toBe("Occitanie");
    expect(regionNameForDepartement("99")).toBeNull();
    expect(regionNameForDepartement(null)).toBeNull();
  });
});
