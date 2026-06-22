import { describe, it, expect } from "vitest";
import { nafToNaics, nogaToNaics, inseeEffectifToBand } from "../normalizers/activity-codes";

describe("nafToNaics / nogaToNaics (spec 06, AC3)", () => {
  it("maps NAF/APE codes to NAICS sectors by NACE division", () => {
    expect(nafToNaics("62.01Z")?.code).toBe("51"); // division 62 -> Information
    expect(nafToNaics("47.11F")?.code).toBe("44-45"); // 47 -> Retail
    expect(nafToNaics("64.19Z")?.code).toBe("52"); // 64 -> Finance
    expect(nafToNaics("41.20A")?.code).toBe("23"); // 41 -> Construction
    expect(nafToNaics("86.10Z")?.code).toBe("62"); // 86 -> Health
  });
  it("maps NOGA codes (no dot) the same way", () => {
    expect(nogaToNaics("6201")?.code).toBe("51");
    expect(nogaToNaics("7022")?.code).toBe("54"); // 70 -> Professional
  });
  it("returns null for empty/unknown", () => {
    expect(nafToNaics(null)).toBeNull();
    expect(nafToNaics("99")).toBeNull(); // no division 99 mapping
  });
});

describe("inseeEffectifToBand (AC2)", () => {
  it("maps INSEE tranche codes to headcount bands", () => {
    expect(inseeEffectifToBand("21")).toBe("50-99");
    expect(inseeEffectifToBand("32")).toBe("250-499");
    expect(inseeEffectifToBand("53")).toBe("10,000+");
    expect(inseeEffectifToBand("99")).toBeNull();
    expect(inseeEffectifToBand(null)).toBeNull();
  });
});
