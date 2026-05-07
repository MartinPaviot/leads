import { describe, it, expect } from "vitest";
import {
  computePercentile,
  computeVelocityStats,
  computePhaseDropoff,
  toMs,
  type OnboardingRow,
} from "@/lib/onboarding/velocity";

describe("computePercentile", () => {
  it("returns null for empty array", () => {
    expect(computePercentile([], 50)).toBeNull();
  });

  it("returns the only element for 1-element array", () => {
    expect(computePercentile([42], 50)).toBe(42);
    expect(computePercentile([42], 0)).toBe(42);
    expect(computePercentile([42], 100)).toBe(42);
  });

  it("matches numpy linear-interp on a known dataset", () => {
    // numpy.percentile([1,2,3,4,5], 50) → 3
    expect(computePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
    // numpy.percentile([1,2,3,4,5], 25) → 2
    expect(computePercentile([1, 2, 3, 4, 5], 25)).toBe(2);
    // numpy.percentile([1,2,3,4,5], 75) → 4
    expect(computePercentile([1, 2, 3, 4, 5], 75)).toBe(4);
  });

  it("interpolates between elements when rank is fractional", () => {
    // numpy.percentile([10, 20], 50) → 15
    expect(computePercentile([10, 20], 50)).toBe(15);
  });

  it("clamps p < 0 to first element + p > 100 to last", () => {
    expect(computePercentile([1, 2, 3], -10)).toBe(1);
    expect(computePercentile([1, 2, 3], 200)).toBe(3);
  });
});

describe("toMs", () => {
  it("converts Date to ms", () => {
    const d = new Date("2026-05-08T10:00:00Z");
    expect(toMs(d)).toBe(d.getTime());
  });

  it("converts ISO string to ms", () => {
    expect(toMs("2026-05-08T10:00:00Z")).toBe(
      new Date("2026-05-08T10:00:00Z").getTime(),
    );
  });

  it("returns NaN on bad input", () => {
    expect(Number.isNaN(toMs("not-a-date"))).toBe(true);
  });
});

function row(
  partial: Partial<OnboardingRow> & { tenantId: string; startedAt: string },
): OnboardingRow {
  return {
    completedAt: null,
    currentPhase: 1,
    completedPhases: [],
    ...partial,
  };
}

describe("computeVelocityStats", () => {
  it("returns zeros on empty input", () => {
    const stats = computeVelocityStats([]);
    expect(stats.totalStarted).toBe(0);
    expect(stats.totalCompleted).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.ttcHoursP50).toBeNull();
    expect(stats.ttcHoursP75).toBeNull();
    expect(stats.ttcHoursP95).toBeNull();
  });

  it("counts started + completed correctly", () => {
    const stats = computeVelocityStats([
      row({
        tenantId: "a",
        startedAt: "2026-05-01T00:00:00Z",
        completedAt: "2026-05-01T05:00:00Z",
        completedPhases: [1, 2, 3, 4, 5, 6, 7],
        currentPhase: 7,
      }),
      row({
        tenantId: "b",
        startedAt: "2026-05-02T00:00:00Z",
        currentPhase: 3,
        completedPhases: [1, 2],
      }),
    ]);
    expect(stats.totalStarted).toBe(2);
    expect(stats.totalCompleted).toBe(1);
    expect(stats.completionRate).toBe(0.5);
  });

  it("computes p50/p75/p95 TTC in hours", () => {
    // 5 completed tenants, TTC : 1, 2, 4, 8, 16 hours.
    // p50 = 4 ; p75 = 8 ; p95 = 14.4 (interp between 8 and 16).
    const items: OnboardingRow[] = [
      { tenantId: "a", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T01:00:00Z"), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
      { tenantId: "b", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T02:00:00Z"), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
      { tenantId: "c", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T04:00:00Z"), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
      { tenantId: "d", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T08:00:00Z"), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
      { tenantId: "e", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T16:00:00Z"), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.ttcHoursP50).toBe(4);
    expect(stats.ttcHoursP75).toBe(8);
    expect(stats.ttcHoursP95).toBe(14.4);
  });

  it("rounds TTC percentiles to 1 decimal", () => {
    const items: OnboardingRow[] = [
      { tenantId: "a", startedAt: new Date(0), completedAt: new Date(1.234 * 3600 * 1000), currentPhase: 7, completedPhases: [] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.ttcHoursP50).toBe(1.2);
  });

  it("drops rows with negative TTC (clock skew safety)", () => {
    const items: OnboardingRow[] = [
      // Negative : completed before started.
      { tenantId: "a", startedAt: new Date("2026-05-02T00:00:00Z"), completedAt: new Date("2026-05-01T00:00:00Z"), currentPhase: 7, completedPhases: [] },
      { tenantId: "b", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T05:00:00Z"), currentPhase: 7, completedPhases: [] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.ttcHoursP50).toBe(5); // only the valid row counts
  });

  it("drops rows with unparseable dates", () => {
    const items: OnboardingRow[] = [
      { tenantId: "a", startedAt: "not-a-date" as unknown as string, completedAt: "also-bad", currentPhase: 7, completedPhases: [] },
      { tenantId: "b", startedAt: new Date("2026-05-01T00:00:00Z"), completedAt: new Date("2026-05-01T03:00:00Z"), currentPhase: 7, completedPhases: [] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.totalCompleted).toBe(2); // both have completedAt set
    expect(stats.ttcHoursP50).toBe(3); // only the valid row contributes
  });

  it("reachedByPhase counts current OR completed phase reach", () => {
    const items: OnboardingRow[] = [
      // Currently on phase 4.
      { tenantId: "a", startedAt: new Date(), completedAt: null, currentPhase: 4, completedPhases: [1, 2, 3] },
      // Currently on phase 1, no progress yet.
      { tenantId: "b", startedAt: new Date(), completedAt: null, currentPhase: 1, completedPhases: [] },
      // Completed.
      { tenantId: "c", startedAt: new Date(), completedAt: new Date(), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.reachedByPhase[1]).toBe(3);
    expect(stats.reachedByPhase[2]).toBe(2);
    expect(stats.reachedByPhase[3]).toBe(2);
    expect(stats.reachedByPhase[4]).toBe(2);
    expect(stats.reachedByPhase[5]).toBe(1);
    expect(stats.reachedByPhase[6]).toBe(1);
    expect(stats.reachedByPhase[7]).toBe(1);
  });

  it("finalisedByPhase only counts tenants who finalised", () => {
    const items: OnboardingRow[] = [
      // Reached phase 4 but not finalised.
      { tenantId: "a", startedAt: new Date(), completedAt: null, currentPhase: 4, completedPhases: [1, 2, 3] },
      // Finalised.
      { tenantId: "b", startedAt: new Date(), completedAt: new Date(), currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7] },
    ];
    const stats = computeVelocityStats(items);
    expect(stats.reachedByPhase[3]).toBe(2);
    expect(stats.finalisedByPhase[3]).toBe(1);
    expect(stats.finalisedByPhase[7]).toBe(1);
  });
});

describe("computePhaseDropoff", () => {
  it("returns 0 for phase 7 (no next)", () => {
    const dropoff = computePhaseDropoff({
      reachedByPhase: { 1: 100, 2: 80, 3: 60, 4: 50, 5: 40, 6: 30, 7: 25 },
    });
    expect(dropoff[7]).toBe(0);
  });

  it("computes 0.2 dropoff when 80 of 100 advanced", () => {
    const dropoff = computePhaseDropoff({
      reachedByPhase: { 1: 100, 2: 80, 3: 60, 4: 50, 5: 40, 6: 30, 7: 25 },
    });
    expect(dropoff[1]).toBe(0.2); // 100 → 80 = 20% drop
    expect(dropoff[2]).toBe(0.25); // 80 → 60 = 25%
  });

  it("returns 0 for empty / zero phase", () => {
    const dropoff = computePhaseDropoff({
      reachedByPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    });
    expect(dropoff[1]).toBe(0);
    expect(dropoff[3]).toBe(0);
  });

  it("rounds to 4 decimals", () => {
    const dropoff = computePhaseDropoff({
      reachedByPhase: { 1: 7, 2: 3, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    });
    // 7 → 3 = 4/7 ≈ 0.5714286
    expect(dropoff[1]).toBe(0.5714);
  });
});
