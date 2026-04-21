import { describe, it, expect } from "vitest";
import { estimateCost, isNearCap } from "@/lib/estimate-cost";

describe("estimateCost — tam-build", () => {
  it("returns the measured baseline numbers", () => {
    const r = estimateCost({ op: "tam-build" });
    expect(r.llmEstimateUsd).toBeCloseTo(0.08, 5);
    expect(r.apolloCredits).toBeGreaterThan(0);
    expect(r.estimatedDurationSeconds).toBeGreaterThan(30);
    expect(r.confidenceLevel).toBe("high");
    expect(r.summary).toMatch(/AI credits/);
  });
});

describe("estimateCost — sequence-draft", () => {
  it("scales linearly with contactCount", () => {
    const r1 = estimateCost({ op: "sequence-draft", params: { contactCount: 1 } });
    const r10 = estimateCost({ op: "sequence-draft", params: { contactCount: 10 } });
    expect(r10.llmEstimateUsd).toBeCloseTo(r1.llmEstimateUsd * 10, 2);
    expect(r10.estimatedDurationSeconds).toBeGreaterThan(r1.estimatedDurationSeconds);
  });

  it("defaults to contactCount=1 when params missing", () => {
    const r = estimateCost({ op: "sequence-draft" });
    expect(r.llmEstimateUsd).toBeGreaterThan(0);
    expect(r.summary).toMatch(/1 drafted email/);
  });

  it("coerces contactCount to at least 1 on zero / negative input", () => {
    const r = estimateCost({ op: "sequence-draft", params: { contactCount: 0 } });
    expect(r.llmEstimateUsd).toBeGreaterThan(0);
    const rNeg = estimateCost({ op: "sequence-draft", params: { contactCount: -5 } });
    expect(rNeg.llmEstimateUsd).toBeGreaterThan(0);
  });

  it("floors non-integer contactCount before scaling", () => {
    const r = estimateCost({ op: "sequence-draft", params: { contactCount: 3.9 } });
    const r3 = estimateCost({ op: "sequence-draft", params: { contactCount: 3 } });
    expect(r.llmEstimateUsd).toBeCloseTo(r3.llmEstimateUsd, 3);
  });
});

describe("estimateCost — inbox-scan", () => {
  it("scales with days param, no LLM cost", () => {
    const r = estimateCost({ op: "inbox-scan", params: { days: 180 } });
    expect(r.llmEstimateUsd).toBe(0);
    expect(r.estimatedDurationSeconds).toBeGreaterThan(0);
  });

  it("defaults to 90 days when no params", () => {
    const r = estimateCost({ op: "inbox-scan" });
    expect(r.summary).toMatch(/90 days/);
  });
});

describe("estimateCost — narrate-website & icp-analysis", () => {
  it("returns measured narrate-website numbers", () => {
    const r = estimateCost({ op: "narrate-website" });
    expect(r.llmEstimateUsd).toBeCloseTo(0.04, 5);
    expect(r.confidenceLevel).toBe("high");
  });

  it("returns measured icp-analysis numbers", () => {
    const r = estimateCost({ op: "icp-analysis" });
    expect(r.llmEstimateUsd).toBeCloseTo(0.06, 5);
    expect(r.apolloCredits).toBeGreaterThan(0);
  });
});

describe("estimateCost — unknown op exhaustive fallback", () => {
  it("returns zero estimate with low confidence for future ops", () => {
    // Cast to bypass TS exhaustiveness at call site so the runtime
    // fallback is exercised.
    const r = estimateCost({ op: "future-op" as never });
    expect(r.llmEstimateUsd).toBe(0);
    expect(r.apolloCredits).toBe(0);
    expect(r.confidenceLevel).toBe("low");
  });
});

describe("isNearCap", () => {
  it("returns false when there is no cap", () => {
    expect(isNearCap({ capUsd: 0, spentUsd: 10 })).toBe(false);
    expect(isNearCap({ capUsd: -5, spentUsd: 10 })).toBe(false);
  });

  it("returns false well below 80% of cap", () => {
    expect(isNearCap({ capUsd: 100, spentUsd: 10 })).toBe(false);
  });

  it("returns true at exactly 80% of cap", () => {
    expect(isNearCap({ capUsd: 100, spentUsd: 80 })).toBe(true);
  });

  it("returns true when adding the proposed spend would push past 80%", () => {
    // 70 spent, +15 proposed → 85% projected.
    expect(isNearCap({ capUsd: 100, spentUsd: 70 }, 15)).toBe(true);
    // 70 spent, +5 proposed → 75% projected → still below.
    expect(isNearCap({ capUsd: 100, spentUsd: 70 }, 5)).toBe(false);
  });

  it("returns true when already over cap", () => {
    expect(isNearCap({ capUsd: 50, spentUsd: 120 })).toBe(true);
  });
});
