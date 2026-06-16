import { describe, it, expect } from "vitest";
import {
  computePropensity,
  valueBand,
  normalizeIntent,
  DEFAULT_PROPENSITY_WEIGHTS,
} from "@/lib/scoring/propensity";

describe("computePropensity", () => {
  it("is a weighted average over present components", () => {
    expect(computePropensity({ depth: 1, intent: 1, reach: 1, value: 1 })).toBeCloseTo(1, 5);
    expect(computePropensity({ depth: 0, intent: 0, reach: 0, value: 0 })).toBe(0);
  });
  it("is monotonic in each component", () => {
    const lo = computePropensity({ depth: 0.2, intent: 0.5, reach: 0.5, value: 0.5 });
    const hi = computePropensity({ depth: 0.9, intent: 0.5, reach: 0.5, value: 0.5 });
    expect(hi).toBeGreaterThan(lo);
  });
  it("renormalises out an absent component (pain) instead of zeroing", () => {
    expect(computePropensity({ depth: 0.8, intent: 0.8, reach: 0.8, value: 0.8 })).toBeCloseTo(0.8, 5);
  });
  it("subtracts penalties and clamps to [0,1]", () => {
    const base = computePropensity({ depth: 0.6, intent: 0.6, reach: 0.6, value: 0.6 });
    expect(
      computePropensity({ depth: 0.6, intent: 0.6, reach: 0.6, value: 0.6 }, DEFAULT_PROPENSITY_WEIGHTS, 0.3),
    ).toBeCloseTo(base - 0.3, 5);
    expect(
      computePropensity({ depth: 0.1, intent: 0.1, reach: 0.1, value: 0.1 }, DEFAULT_PROPENSITY_WEIGHTS, 0.9),
    ).toBe(0);
  });
  it("respects weights — a heavier component pulls harder", () => {
    const w = { depth: 0.7, intent: 0.1, reach: 0.1, value: 0.1 };
    const highDepth = computePropensity({ depth: 1, intent: 0, reach: 0, value: 0 }, w);
    const highIntent = computePropensity({ depth: 0, intent: 1, reach: 0, value: 0 }, w);
    expect(highDepth).toBeGreaterThan(highIntent);
  });
});

describe("valueBand", () => {
  it("is monotonic in size and capped at 1", () => {
    expect(valueBand({ employeeCount: 1000 })).toBeCloseTo(1, 5);
    expect(valueBand({ employeeCount: 900 })).toBeGreaterThan(valueBand({ employeeCount: 120 }));
    expect(valueBand({ employeeCount: 120 })).toBeGreaterThan(0.3);
    expect(valueBand({ employeeCount: 100000 })).toBe(1); // capped
    expect(valueBand({})).toBe(0);
  });
});

describe("normalizeIntent", () => {
  it("maps signal lift [0.5,2.5] → intent [0,1] with baseline 1.0 → 0", () => {
    expect(normalizeIntent(1)).toBe(0);
    expect(normalizeIntent(2.5)).toBeCloseTo(1, 5);
    expect(normalizeIntent(1.75)).toBeCloseTo(0.5, 5);
    expect(normalizeIntent(0.5)).toBe(0);
  });
});
