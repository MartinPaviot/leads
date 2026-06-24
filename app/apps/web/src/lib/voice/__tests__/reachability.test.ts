import { describe, it, expect } from "vitest";
import { accessibilityScoreFromPhoneType } from "@/lib/voice/reachability";

describe("accessibilityScoreFromPhoneType (P1 20)", () => {
  it("scores by phone type", () => {
    expect(accessibilityScoreFromPhoneType("mobile")).toBe(1.0);
    expect(accessibilityScoreFromPhoneType("direct")).toBe(0.7);
    expect(accessibilityScoreFromPhoneType("switchboard")).toBe(0.4);
  });

  it("falls back to 0.5 for unknown / missing types", () => {
    expect(accessibilityScoreFromPhoneType(undefined)).toBe(0.5);
    expect(accessibilityScoreFromPhoneType(null)).toBe(0.5);
    expect(accessibilityScoreFromPhoneType("voip")).toBe(0.5);
  });

  it("matches the buildQueue mapping (mobile > direct > switchboard > unknown)", () => {
    expect(accessibilityScoreFromPhoneType("mobile")).toBeGreaterThan(accessibilityScoreFromPhoneType("direct"));
    expect(accessibilityScoreFromPhoneType("direct")).toBeGreaterThan(accessibilityScoreFromPhoneType("switchboard"));
    expect(accessibilityScoreFromPhoneType("switchboard")).toBeLessThan(accessibilityScoreFromPhoneType("voip"));
  });
});
