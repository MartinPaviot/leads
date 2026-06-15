import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPACITY_CAP,
  computeRevEquation,
  type RevEquationInput,
} from "../rev-equation";

const base: RevEquationInput = { contactedForecast: 6000, acv: 12000 };

describe("computeRevEquation — point estimate", () => {
  it("multiplies the benchmark chain through to a sane deal count", () => {
    const out = computeRevEquation(base);
    // 6000 x 0.034 x 0.62 x 0.80 x 0.55 x 0.70 x 0.22 ~= 8.6 deals
    expect(out.expectedDeals).toBeGreaterThan(7);
    expect(out.expectedDeals).toBeLessThan(11);
    expect(out.revenue.mean).toBeGreaterThan(90_000);
  });
});

describe("computeRevEquation — honesty (never a bare point)", () => {
  it("returns a wide range with CV near 100% on benchmark priors", () => {
    const out = computeRevEquation(base);
    expect(out.revenue.cvPercent).toBeGreaterThan(80);
    expect(out.revenue.p90).toBeGreaterThan(out.revenue.mean);
    expect(out.revenue.p10).toBeLessThan(out.revenue.mean);
    expect(out.revenue.p10).toBeGreaterThanOrEqual(0); // revenue can't be negative
  });

  it("flags prior-dominated when the tenant has no data", () => {
    const out = computeRevEquation(base);
    expect(out.dataConfidence).toBe("prior-dominated");
    expect(out.notes.join(" ")).toMatch(/prior/i);
    for (const s of Object.values(out.rateSource)) expect(s).toBe("prior");
  });

  it("uses observed rates once the denominator is powered, and narrows confidence", () => {
    const out = computeRevEquation({
      ...base,
      observed: {
        contacted: 2000, replied: 80,   // 4% reply (>=20 trials)
        booked: 50, showed: 40, qualified: 22, proposal: 15, won: 4,
      },
    });
    expect(out.rateSource.reply).toBe("observed");
    expect(out.rates.reply).toBeCloseTo(0.04, 2);
    expect(out.dataConfidence).toBe("data-dominated");
  });

  it("ignores an under-powered denominator and keeps the prior", () => {
    const out = computeRevEquation({
      ...base,
      observed: { contacted: 10, replied: 5 }, // only 10 trials < 20 → prior
    });
    expect(out.rateSource.reply).toBe("prior");
    expect(out.rates.reply).toBeCloseTo(0.034, 3);
  });
});

describe("computeRevEquation — bottleneck", () => {
  it("flags capacity first: a full pipeline makes new prospecting wasted", () => {
    const out = computeRevEquation({ ...base, goal: 120_000, activeDeals: DEFAULT_CAPACITY_CAP });
    expect(out.bottleneck).toBe("capacity");
    expect(out.diagnosis).toMatch(/capacity/i);
  });

  it("flags demand when opportunities in play fall short of the goal", () => {
    const out = computeRevEquation({
      ...base,
      goal: 600_000, // needs 50 deals at 12k ACV
      activeDeals: 3,
      observed: { qualified: 2, proposal: 1 }, // 3 in play << 4x50
    });
    expect(out.bottleneck).toBe("demand");
    expect(out.coverage?.dealsNeeded).toBe(50);
    expect(out.diagnosis).toMatch(/demand/i);
  });

  it("flags conversion when demand is abundant relative to the goal", () => {
    const out = computeRevEquation({
      ...base,
      goal: 24_000, // needs only 2 deals
      activeDeals: 5,
      observed: { qualified: 6, proposal: 5 }, // 11 in play >> 4x2
    });
    expect(out.bottleneck).toBe("conversion");
    expect(out.diagnosis).toMatch(/conversion/i);
  });

  it("defaults to the demand-first prior when no goal is set", () => {
    const out = computeRevEquation(base);
    expect(out.bottleneck).toBe("demand");
    expect(out.coverage).toBeNull();
    expect(out.notes.join(" ")).toMatch(/no revenue goal/i);
  });
});

describe("computeRevEquation — edge cases", () => {
  it("does not divide by zero or NaN on an unset ACV", () => {
    const out = computeRevEquation({ contactedForecast: 1000, acv: 0, goal: 50_000 });
    expect(Number.isFinite(out.revenue.mean)).toBe(true);
    expect(out.notes.join(" ")).toMatch(/acv/i);
  });

  it("handles zero top-of-funnel", () => {
    const out = computeRevEquation({ contactedForecast: 0, acv: 12000 });
    expect(out.expectedDeals).toBe(0);
    expect(out.revenue.mean).toBe(0);
  });
});
