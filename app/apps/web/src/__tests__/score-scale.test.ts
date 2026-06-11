import { describe, it, expect, vi } from "vitest";

// fit-recompute-core imports @/db for its batch I/O; gradeRank itself is
// pure. Mock the client so this stays a unit test (no connection).
vi.mock("@/db", () => ({ db: {} }));

import {
  fitFromCompanyScore,
  computePriorityScore,
  NEUTRAL_FIT_SCORE,
} from "@/lib/scoring/priority-score";
import { gradeRank } from "@/lib/icp/fit-recompute-core";
import { computeBlendedFit, type Criterion } from "@/lib/icp/criteria-engine";

/**
 * Phase 0 scale contract (_specs/icp-unification R1): companies.score
 * is 0-100 everywhere. These tests pin the two adapters and the mirror
 * math so no writer can quietly reintroduce a 0-1 value — the bug that
 * collapsed every grade to F in prod (489/990 companies at 0, max 0.85).
 */

describe("fitFromCompanyScore — 0-100 column → 0-1 priority input", () => {
  it("passes NULL through so the neutral default still applies", () => {
    expect(fitFromCompanyScore(null)).toBeNull();
    expect(computePriorityScore({ signalMultiplier: 1, fitScore: null, accessibility: 1 })).toBe(
      NEUTRAL_FIT_SCORE,
    );
  });

  it("maps the 0-100 scale into [0,1]", () => {
    expect(fitFromCompanyScore(85)).toBeCloseTo(0.85, 10);
    expect(fitFromCompanyScore(0)).toBe(0);
    expect(fitFromCompanyScore(100)).toBe(1);
  });

  it("clamps out-of-band values (mid-backfill remnants)", () => {
    expect(fitFromCompanyScore(150)).toBe(1);
    expect(fitFromCompanyScore(-5)).toBe(0);
  });

  it("keeps priority_score inside its documented ~[0, 2.5] band", () => {
    const max = computePriorityScore({
      signalMultiplier: 2.5,
      fitScore: fitFromCompanyScore(100),
      accessibility: 1,
    });
    expect(max).toBeLessThanOrEqual(2.5);
  });
});

describe("gradeRank — regrade diff ordering", () => {
  it("orders Not-scored < F < D < C < B < A < A+", () => {
    const ranks = [null, 10, 25, 45, 70, 85, 95].map((s) => gradeRank(s));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
    expect(gradeRank(null)).toBe(-1);
  });
});

describe("mirror math — round(100 × score01) is an integer in {0} ∪ [1,100]", () => {
  const crit: Criterion[] = [
    { id: "ind", fieldKey: "industry", operator: "in", value: ["Banking"], weight: 2, isRequired: false },
    { id: "emp", fieldKey: "employee_count", operator: "between", value: { min: 10, max: 500 }, weight: 3, isRequired: false },
  ];

  it("never lands in the broken (0,1) band", () => {
    const contexts = [
      { industry: "Banking", employee_count: 100 },
      { industry: "Banking" },
      { employee_count: 100 },
      { industry: "Retail", employee_count: 5000 },
      {},
    ];
    for (const ctx of contexts) {
      const mirror = Math.round(100 * computeBlendedFit(crit, ctx).score01);
      expect(Number.isInteger(mirror)).toBe(true);
      expect(mirror === 0 || (mirror >= 1 && mirror <= 100)).toBe(true);
    }
  });
});
