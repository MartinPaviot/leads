import { describe, it, expect, vi } from "vitest";
import {
  computeMonthlySpendUsd,
  resolveCapUsd,
  evaluateSpend,
  isCapReached,
  loadSpendDecision,
  startOfUtcMonth,
} from "@/lib/visitor-id/spend-cap";

describe("computeMonthlySpendUsd", () => {
  it("uses default rate when not specified", () => {
    expect(computeMonthlySpendUsd({ identifications: 100 })).toBe(6);
  });

  it("respects custom rate", () => {
    expect(
      computeMonthlySpendUsd({ identifications: 100, ratePerMatchUsd: 0.1 }),
    ).toBe(10);
  });

  it("rounds to 2 decimals", () => {
    expect(
      computeMonthlySpendUsd({ identifications: 333, ratePerMatchUsd: 0.06 }),
    ).toBe(19.98);
  });

  it("returns 0 for invalid inputs", () => {
    expect(computeMonthlySpendUsd({ identifications: NaN })).toBe(0);
    expect(computeMonthlySpendUsd({ identifications: -5 })).toBe(0);
    expect(computeMonthlySpendUsd({ identifications: 100, ratePerMatchUsd: -1 })).toBe(0);
    expect(
      computeMonthlySpendUsd({ identifications: 100, ratePerMatchUsd: NaN }),
    ).toBe(0);
  });
});

describe("resolveCapUsd", () => {
  it("returns default 50 on null/empty", () => {
    expect(resolveCapUsd(null)).toBe(50);
    expect(resolveCapUsd(undefined)).toBe(50);
    expect(resolveCapUsd({})).toBe(50);
  });

  it("returns the explicit setting", () => {
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: 200 })).toBe(200);
  });

  it("clamps at 5000 hard ceiling", () => {
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: 99999 })).toBe(5000);
  });

  it("falls back on negative / non-numeric", () => {
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: -10 })).toBe(50);
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: "100" })).toBe(50);
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: NaN })).toBe(50);
    expect(resolveCapUsd({ snitcherMonthlyCapUsd: Infinity })).toBe(50);
  });
});

describe("evaluateSpend", () => {
  it("flags reached when spend >= cap", () => {
    expect(evaluateSpend(50, 50).reached).toBe(true);
    expect(evaluateSpend(100, 50).reached).toBe(true);
  });

  it("flags warning within $5 of cap", () => {
    expect(evaluateSpend(46, 50).warning).toBe(true);
    expect(evaluateSpend(40, 50).warning).toBe(false);
  });

  it("warning is false when reached", () => {
    expect(evaluateSpend(50, 50).warning).toBe(false);
  });

  it("uses 10% buffer when cap is large enough that 10% > $5", () => {
    // $1000 cap → 10% = $100 buffer. $920 spend should warn.
    expect(evaluateSpend(920, 1000).warning).toBe(true);
    expect(evaluateSpend(890, 1000).warning).toBe(false);
  });

  it("computes remainingUsd ≥ 0", () => {
    expect(evaluateSpend(60, 50).remainingUsd).toBe(0);
    expect(evaluateSpend(20, 50).remainingUsd).toBe(30);
  });
});

describe("isCapReached", () => {
  it("delegates to evaluateSpend", () => {
    expect(isCapReached({ spendUsd: 50, capUsd: 50 })).toBe(true);
    expect(isCapReached({ spendUsd: 49.99, capUsd: 50 })).toBe(false);
  });
});

describe("loadSpendDecision", () => {
  it("composes count + settings into a decision", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t-1",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 1000),
        loadTenantSettings: vi.fn(async () => ({ snitcherMonthlyCapUsd: 100 })),
      },
    });
    expect(decision.spendUsd).toBe(60); // 1000 × 0.06
    expect(decision.capUsd).toBe(100);
    expect(decision.reached).toBe(false);
  });

  it("flags reached when count exceeds cap", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t-1",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 2000),
        loadTenantSettings: vi.fn(async () => ({ snitcherMonthlyCapUsd: 100 })),
      },
    });
    expect(decision.reached).toBe(true);
  });

  it("uses default cap when settings absent", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t-1",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 100),
        loadTenantSettings: vi.fn(async () => null),
      },
    });
    expect(decision.capUsd).toBe(50);
  });

  it("respects custom rate", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t-1",
      ratePerMatchUsd: 0.5,
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 100),
        loadTenantSettings: vi.fn(async () => ({})),
      },
    });
    expect(decision.spendUsd).toBe(50);
  });

  it("passes the now timestamp to the count fn for month-bounding", async () => {
    const countSpy = vi.fn(async () => 0);
    const now = new Date("2026-05-15T12:00:00Z");
    await loadSpendDecision({
      tenantId: "t-1",
      now,
      deps: {
        countIdentificationsThisMonth: countSpy,
        loadTenantSettings: vi.fn(async () => ({})),
      },
    });
    expect(countSpy).toHaveBeenCalledWith("t-1", now);
  });
});

describe("startOfUtcMonth", () => {
  it("returns 00:00:00 on the 1st of the same month UTC", () => {
    expect(
      startOfUtcMonth(new Date("2026-05-15T12:34:56Z")).toISOString(),
    ).toBe("2026-05-01T00:00:00.000Z");
  });

  it("handles January correctly", () => {
    expect(
      startOfUtcMonth(new Date("2026-01-31T23:59:59Z")).toISOString(),
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ignores local timezone (UTC anchored)", () => {
    expect(
      startOfUtcMonth(new Date("2026-12-01T01:00:00Z")).toISOString(),
    ).toBe("2026-12-01T00:00:00.000Z");
  });
});
