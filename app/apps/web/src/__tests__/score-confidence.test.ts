import { describe, it, expect } from "vitest";
import { computeConfidence } from "@/lib/scoring/confidence";

const NOW = new Date("2026-06-16T00:00:00Z");

describe("computeConfidence", () => {
  it("full coverage + fresh data → high confidence", () => {
    const { confidence } = computeConfidence({
      coverage: 1,
      dataDates: ["2026-06-10T00:00:00Z"], // ~6 days old
      now: NOW,
    });
    expect(confidence).toBeGreaterThan(0.95);
  });

  it("full coverage + STALE data (1 year, half-life 180d) → confidence collapses", () => {
    const { confidence, freshnessFactor } = computeConfidence({
      coverage: 1,
      dataDates: ["2025-06-16T00:00:00Z"], // ~365 days
      now: NOW,
    });
    expect(freshnessFactor).toBeLessThan(0.3);
    expect(confidence).toBeLessThan(0.3);
  });

  it("thin coverage caps confidence regardless of freshness", () => {
    const { confidence } = computeConfidence({ coverage: 0.3, dataDates: [NOW], now: NOW });
    expect(confidence).toBeCloseTo(0.3, 5);
  });

  it("missing dates do not penalise freshness (flagged by coverage only)", () => {
    const { confidence, freshnessFactor } = computeConfidence({ coverage: 0.8, now: NOW });
    expect(freshnessFactor).toBe(1);
    expect(confidence).toBeCloseTo(0.8, 5);
  });

  it("uses the STALEST date as the bottleneck", () => {
    const fresh = computeConfidence({ coverage: 1, dataDates: ["2026-06-15T00:00:00Z"], now: NOW });
    const mixed = computeConfidence({
      coverage: 1,
      dataDates: ["2026-06-15T00:00:00Z", "2025-06-16T00:00:00Z"],
      now: NOW,
    });
    expect(mixed.confidence).toBeLessThan(fresh.confidence);
  });
});
