import { describe, it, expect } from "vitest";
import {
  computeBacktest,
  pointBiserial,
  MIN_SAMPLE,
  type BacktestRow,
} from "@/lib/evals/personalization-backtest";

/** Build n rows at a fixed composite, `repliedOf` of them replied. */
function rows(composite: number, n: number, repliedOf: number): BacktestRow[] {
  return Array.from({ length: n }, (_, i) => ({ composite, replied: i < repliedOf }));
}

describe("computeBacktest — bucketing (R13, edge 11 bounds)", () => {
  it("assigns composites to [lo,hi) tiers; 0.5 and 0.9 land in the upper tier", () => {
    const data: BacktestRow[] = [
      { composite: 0.49, replied: false }, // <0.5
      { composite: 0.5, replied: true }, // 0.5-0.7 (lower bound inclusive)
      { composite: 0.69, replied: false }, // 0.5-0.7
      { composite: 0.7, replied: true }, // 0.7-0.9
      { composite: 0.89, replied: false }, // 0.7-0.9
      { composite: 0.9, replied: true }, // >=0.9
      { composite: 1.0, replied: true }, // >=0.9
    ];
    const r = computeBacktest(data, 90);
    const byTier = Object.fromEntries(r.buckets.map((b) => [b.tier, b]));
    expect(byTier["<0.5"].n).toBe(1);
    expect(byTier["0.5-0.7"].n).toBe(2);
    expect(byTier["0.7-0.9"].n).toBe(2);
    expect(byTier[">=0.9"].n).toBe(2);
    expect(r.totalScored).toBe(7);
  });

  it("replyRate = replied/n per tier; 0 when the tier is empty", () => {
    const data = [...rows(0.95, 4, 3), ...rows(0.3, 2, 0)];
    const byTier = Object.fromEntries(computeBacktest(data, 90).buckets.map((b) => [b.tier, b]));
    expect(byTier[">=0.9"]).toMatchObject({ n: 4, replied: 3, replyRate: 0.75 });
    expect(byTier["<0.5"]).toMatchObject({ n: 2, replied: 0, replyRate: 0 });
    expect(byTier["0.5-0.7"]).toMatchObject({ n: 0, replyRate: 0 });
  });
});

describe("computeBacktest — insufficient data gate (R15)", () => {
  it(`< ${MIN_SAMPLE} rows → insufficientData, correlation null`, () => {
    const r = computeBacktest(rows(0.8, MIN_SAMPLE - 1, 10), 90);
    expect(r.insufficientData).toBe(true);
    expect(r.correlation).toBeNull();
    // buckets are still populated (the counts are honest even if undersized)
    expect(r.totalScored).toBe(MIN_SAMPLE - 1);
  });

  it(`>= ${MIN_SAMPLE} rows → not insufficient, correlation computed`, () => {
    // high scores reply, low scores don't → strong positive correlation
    const data = [...rows(0.95, 20, 18), ...rows(0.2, 20, 1)];
    const r = computeBacktest(data, 90);
    expect(r.insufficientData).toBe(false);
    expect(r.correlation).not.toBeNull();
    expect(r.correlation!).toBeGreaterThan(0.5);
  });
});

describe("pointBiserial — sign + degenerate cases (R14)", () => {
  it("positive when high composite ↔ replied", () => {
    const data = [...rows(0.9, 25, 22), ...rows(0.3, 25, 3)];
    expect(pointBiserial(data)!).toBeGreaterThan(0);
  });

  it("negative when high composite ↔ NOT replied (inverse)", () => {
    const data = [...rows(0.9, 25, 3), ...rows(0.3, 25, 22)];
    expect(pointBiserial(data)!).toBeLessThan(0);
  });

  it("null when no variance: all same score, or all/none replied", () => {
    expect(pointBiserial(rows(0.8, 40, 20))).toBeNull(); // x has no variance
    expect(pointBiserial([...rows(0.9, 20, 20), ...rows(0.3, 20, 20)])).toBeNull(); // y all replied
    expect(pointBiserial([...rows(0.9, 20, 0), ...rows(0.3, 20, 0)])).toBeNull(); // y none replied
  });

  it("null below 2 rows", () => {
    expect(pointBiserial([])).toBeNull();
    expect(pointBiserial(rows(0.8, 1, 1))).toBeNull();
  });

  it("equals Pearson r for a known 4-point set", () => {
    // x=[0,0,1,1], y=[0,1,0,1] → r = 0 by symmetry
    const data: BacktestRow[] = [
      { composite: 0, replied: false },
      { composite: 0, replied: true },
      { composite: 1, replied: false },
      { composite: 1, replied: true },
    ];
    expect(pointBiserial(data)).toBeCloseTo(0, 10);
  });
});
