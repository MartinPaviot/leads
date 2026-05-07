import { describe, it, expect } from "vitest";
import {
  computeHealthScore,
  defaultNextActionFor,
} from "@/lib/cs/health-score";

describe("computeHealthScore", () => {
  it("returns 100 for max-everything input", () => {
    const r = computeHealthScore({
      usage: 100,
      sentiment: 100,
      engagement: 100,
      velocity: 100,
      support: 100,
    });
    expect(r.score).toBe(100);
    expect(r.riskLevel).toBe("thriving");
  });

  it("returns 0 for zero-everything input", () => {
    const r = computeHealthScore({
      usage: 0,
      sentiment: 0,
      engagement: 0,
      velocity: 0,
      support: 0,
    });
    expect(r.score).toBe(0);
    expect(r.riskLevel).toBe("high");
  });

  it("clamps out-of-range inputs to 0-100", () => {
    const r = computeHealthScore({
      usage: 999,
      sentiment: -50,
      engagement: 100,
      velocity: 100,
      support: 100,
    });
    expect(r.components.usage).toBe(100);
    expect(r.components.sentiment).toBe(0);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("classifies risk levels correctly", () => {
    // Thresholds : >=80 thriving, >=60 low, >=40 medium, else high.
    const r1 = computeHealthScore({ usage: 100, sentiment: 90, engagement: 90, velocity: 90, support: 90 });
    expect(r1.riskLevel).toBe("thriving");

    const r2 = computeHealthScore({ usage: 70, sentiment: 70, engagement: 70, velocity: 70, support: 70 });
    expect(r2.riskLevel).toBe("low");

    const r3 = computeHealthScore({ usage: 50, sentiment: 50, engagement: 50, velocity: 50, support: 50 });
    expect(r3.riskLevel).toBe("medium");

    const r4 = computeHealthScore({ usage: 20, sentiment: 20, engagement: 20, velocity: 20, support: 20 });
    expect(r4.riskLevel).toBe("high");
  });

  it("identifies the two weakest axes correctly", () => {
    const r = computeHealthScore({
      usage: 80,
      sentiment: 30, // weakest
      engagement: 40, // 2nd weakest
      velocity: 80,
      support: 80,
    });
    expect(r.weakestAxes).toEqual(["sentiment", "engagement"]);
  });

  it("respects weight calibration — sentiment + engagement matter most", () => {
    // Tenant with high usage but tanking sentiment + engagement
    // should score worse than one with the inverse, because the
    // weights tilt toward sentiment + engagement.
    const lowSentEng = computeHealthScore({
      usage: 100,
      sentiment: 0,
      engagement: 0,
      velocity: 100,
      support: 100,
    });
    const lowUsageVel = computeHealthScore({
      usage: 0,
      sentiment: 100,
      engagement: 100,
      velocity: 0,
      support: 100,
    });
    expect(lowSentEng.score).toBeLessThan(lowUsageVel.score);
  });

  it("treats NaN gracefully (defaults to 0)", () => {
    const r = computeHealthScore({
      usage: Number.NaN,
      sentiment: 100,
      engagement: 100,
      velocity: 100,
      support: 100,
    });
    expect(r.components.usage).toBe(0);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe("defaultNextActionFor", () => {
  it("returns a distinct action per axis", () => {
    const usage = defaultNextActionFor("usage");
    const sentiment = defaultNextActionFor("sentiment");
    const engagement = defaultNextActionFor("engagement");
    const velocity = defaultNextActionFor("velocity");
    const support = defaultNextActionFor("support");

    const all = [usage, sentiment, engagement, velocity, support];
    expect(new Set(all.map((a) => a.action)).size).toBe(5);
    for (const a of all) {
      expect(a.action.length).toBeGreaterThan(10);
      expect(a.reason.length).toBeGreaterThan(10);
    }
  });
});
