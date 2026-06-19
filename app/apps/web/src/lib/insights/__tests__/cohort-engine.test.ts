import { describe, expect, it } from "vitest";
import {
  benjaminiHochberg,
  classifyCohorts,
  fisherExactGreater,
  type CohortCell,
} from "../cohort-engine";

describe("fisherExactGreater (hand-computable cases)", () => {
  it("perfect 2v2 separation: p = 1/6", () => {
    // [[2,0],[0,2]], margins all 2, P(x>=2) = C(2,2)C(2,0)/C(4,2) = 1/6
    expect(fisherExactGreater(2, 0, 0, 2)).toBeCloseTo(0.1667, 3);
  });
  it("perfect 3v3 separation: p = 1/20 = 0.05", () => {
    expect(fisherExactGreater(3, 0, 0, 3)).toBeCloseTo(0.05, 4);
  });
  it("no enrichment (identical halves) gives a large p", () => {
    expect(fisherExactGreater(5, 5, 5, 5)).toBeGreaterThan(0.5);
  });
  it("is monotone: stronger enrichment yields a smaller p", () => {
    const weak = fisherExactGreater(6, 4, 4, 6);
    const strong = fisherExactGreater(9, 1, 1, 9);
    expect(strong).toBeLessThan(weak);
  });
  it("returns 1 on empty / degenerate tables", () => {
    expect(fisherExactGreater(0, 0, 0, 0)).toBe(1);
    expect(fisherExactGreater(0, 0, 5, 5)).toBe(1);
  });
});

describe("benjaminiHochberg", () => {
  it("corrects a lone small p among nulls", () => {
    const q = benjaminiHochberg([0.001, 0.5, 0.5, 0.5]);
    expect(q[0]).toBeCloseTo(0.004, 4); // 0.001 * 4 / 1
  });
  it("is monotone in p-order and capped at 1", () => {
    const q = benjaminiHochberg([0.2, 0.9, 0.01]);
    expect(Math.max(...q)).toBeLessThanOrEqual(1);
    // smallest p gets the smallest q
    expect(q[2]).toBeLessThan(q[0]);
  });
  it("handles the empty case", () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe("classifyCohorts — THE headline test: zero insights on noise", () => {
  it("returns ZERO insights when every cohort sits at the same rate", () => {
    // 6 cohorts, each 30 deals, ~50% win — pure noise, no real effect.
    const cells: CohortCell[] = ["a", "b", "c", "d", "e", "f"].map((v) => ({
      dimension: "persona",
      value: v,
      n: 30,
      won: 15,
    }));
    const out = classifyCohorts(cells);
    expect(out.insights).toHaveLength(0);
    expect(out.summary).toMatch(/no segment|chance/i);
  });

  it("does not promote a small noisy cohort that happens to look great", () => {
    // One tiny cohort at 100% (4/4) amid a 40% baseline — classic small-n
    // mirage. Must NOT be an insight (n below floor); at most a hypothesis.
    const cells: CohortCell[] = [
      { dimension: "region", value: "lucky", n: 4, won: 4 },
      { dimension: "region", value: "rest1", n: 50, won: 20 },
      { dimension: "region", value: "rest2", n: 50, won: 20 },
    ];
    const out = classifyCohorts(cells);
    const lucky = out.cohorts.find((c) => c.value === "lucky")!;
    expect(lucky.tier).not.toBe("insight");
  });
});

describe("classifyCohorts — finds a real, well-powered effect", () => {
  it("promotes a strong, large-sample segment to insight", () => {
    // finance closes 60/100; everyone else ~20% across large samples.
    const cells: CohortCell[] = [
      { dimension: "persona", value: "finance", n: 100, won: 60 },
      { dimension: "persona", value: "ops", n: 120, won: 24 },
      { dimension: "persona", value: "eng", n: 120, won: 25 },
    ];
    const out = classifyCohorts(cells);
    const finance = out.insights.find((c) => c.value === "finance");
    expect(finance).toBeDefined();
    expect(finance!.lift).toBeGreaterThan(2);
    expect(finance!.qValue).toBeLessThan(0.1);
    expect(out.summary).toMatch(/significantly better/i);
  });
});

describe("classifyCohorts — honesty floor below minimum total", () => {
  it("calls nothing an insight under the total-deals floor and says so", () => {
    const cells: CohortCell[] = [
      { dimension: "persona", value: "finance", n: 8, won: 7 },
      { dimension: "persona", value: "ops", n: 6, won: 1 },
    ]; // 14 total < 20 floor
    const out = classifyCohorts(cells);
    expect(out.insights).toHaveLength(0);
    expect(out.summary).toMatch(/too few|closed deals/i);
  });

  it("a real effect just over the floor with thin cells stays a hypothesis, not an insight", () => {
    const cells: CohortCell[] = [
      { dimension: "persona", value: "finance", n: 10, won: 8 }, // strong but n<15
      { dimension: "persona", value: "rest", n: 14, won: 3 },
    ];
    const out = classifyCohorts(cells);
    const finance = out.cohorts.find((c) => c.value === "finance")!;
    expect(finance.tier).not.toBe("insight"); // below minInsightN
  });
});

describe("classifyCohorts — output integrity", () => {
  it("computes rate, baseline and lift coherently", () => {
    const cells: CohortCell[] = [
      { dimension: "x", value: "hi", n: 50, won: 30 },
      { dimension: "x", value: "lo", n: 50, won: 10 },
    ];
    const out = classifyCohorts(cells);
    const hi = out.cohorts.find((c) => c.value === "hi")!;
    expect(hi.rate).toBeCloseTo(0.6, 2);
    expect(hi.baselineRate).toBeCloseTo(0.2, 2);
    expect(hi.lift).toBeCloseTo(3, 1);
    expect(out.totalDeals).toBe(100);
    expect(out.totalWon).toBe(40);
  });
});
