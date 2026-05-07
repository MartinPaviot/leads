import { describe, it, expect, vi } from "vitest";
import {
  buildChargeRow,
  capResponseMeta,
  loadActualSpendUsd,
  CHARGES_CONSTANTS,
} from "@/lib/visitor-id/charges";
import { loadSpendDecision } from "@/lib/visitor-id/spend-cap";

describe("buildChargeRow", () => {
  it("uses default rate when ratePerCallUsd is omitted", () => {
    const row = buildChargeRow({
      tenantId: "t-1",
      visitId: "v-1",
      provider: "snitcher",
      matched: true,
    });
    expect(row.costUsd).toBe(CHARGES_CONSTANTS.DEFAULT_RATE_PER_MATCH_USD);
    expect(row.matched).toBe(true);
    expect(row.provider).toBe("snitcher");
    expect(row.tenantId).toBe("t-1");
    expect(row.visitId).toBe("v-1");
  });

  it("respects explicit per-call rate", () => {
    const row = buildChargeRow({
      tenantId: "t-1",
      visitId: "v-1",
      provider: "snitcher",
      matched: true,
      ratePerCallUsd: 0.04,
    });
    expect(row.costUsd).toBe(0.04);
  });

  it("rounds to 6 decimals", () => {
    const row = buildChargeRow({
      tenantId: "t-1",
      visitId: null,
      provider: "snitcher",
      matched: false,
      ratePerCallUsd: 0.123456789,
    });
    expect(row.costUsd).toBe(0.123457);
  });

  it("returns null cost on negative / NaN rate", () => {
    expect(
      buildChargeRow({
        tenantId: "t",
        visitId: null,
        provider: "snitcher",
        matched: false,
        ratePerCallUsd: -0.05,
      }).costUsd,
    ).toBeNull();
    expect(
      buildChargeRow({
        tenantId: "t",
        visitId: null,
        provider: "snitcher",
        matched: false,
        ratePerCallUsd: NaN,
      }).costUsd,
    ).toBeNull();
  });

  it("preserves matched=false for no-match charges (provider charges per lookup)", () => {
    const row = buildChargeRow({
      tenantId: "t",
      visitId: "v",
      provider: "snitcher",
      matched: false,
    });
    expect(row.matched).toBe(false);
    expect(row.costUsd).toBe(CHARGES_CONSTANTS.DEFAULT_RATE_PER_MATCH_USD);
  });

  it("threads visitId=null through (worker retried for deleted visit)", () => {
    expect(
      buildChargeRow({
        tenantId: "t",
        visitId: null,
        provider: "snitcher",
        matched: false,
      }).visitId,
    ).toBeNull();
  });

  it("threads responseMeta when present", () => {
    const row = buildChargeRow({
      tenantId: "t",
      visitId: "v",
      provider: "snitcher",
      matched: true,
      responseMeta: { confidence: 0.92, requestId: "req-1" },
    });
    expect(row.responseMeta).toEqual({ confidence: 0.92, requestId: "req-1" });
  });

  it("defaults responseMeta to {} when omitted", () => {
    const row = buildChargeRow({
      tenantId: "t",
      visitId: "v",
      provider: "snitcher",
      matched: true,
    });
    expect(row.responseMeta).toEqual({});
  });
});

describe("capResponseMeta", () => {
  it("passes through small payloads unchanged", () => {
    const small = { confidence: 0.92, requestId: "abc" };
    expect(capResponseMeta(small)).toEqual(small);
  });

  it("truncates payloads over 1KB", () => {
    const huge = { blob: "x".repeat(2000) };
    const result = capResponseMeta(huge);
    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBeGreaterThan(
      CHARGES_CONSTANTS.RESPONSE_META_BUDGET_BYTES,
    );
  });

  it("handles non-serialisable input safely", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const result = capResponseMeta(cyclic);
    expect(result.truncated).toBe(true);
    expect(result.reason).toBe("non_serialisable");
  });

  it("preserves null/empty meta", () => {
    expect(capResponseMeta({})).toEqual({});
  });
});

describe("loadActualSpendUsd", () => {
  it("returns null when ledger has 0 rows for the tenant", async () => {
    const result = await loadActualSpendUsd({
      tenantId: "t",
      deps: {
        sumChargesThisMonth: vi.fn(async () => ({ totalUsd: 0, rowCount: 0 })),
      },
    });
    expect(result.spendUsd).toBeNull();
    expect(result.rowCount).toBe(0);
  });

  it("returns rounded total when ledger has rows", async () => {
    const result = await loadActualSpendUsd({
      tenantId: "t",
      deps: {
        sumChargesThisMonth: vi.fn(async () => ({
          totalUsd: 12.345678,
          rowCount: 100,
        })),
      },
    });
    expect(result.spendUsd).toBe(12.35);
    expect(result.rowCount).toBe(100);
  });

  it("passes the now timestamp to the dep", async () => {
    const spy = vi.fn(async () => ({ totalUsd: 0, rowCount: 0 }));
    const now = new Date("2026-05-15T12:00:00Z");
    await loadActualSpendUsd({
      tenantId: "t",
      now,
      deps: { sumChargesThisMonth: spy },
    });
    expect(spy).toHaveBeenCalledWith("t", now);
  });
});

describe("loadSpendDecision — ledger-first integration", () => {
  it("falls back to count × rate when ledger sum returns 0 rows", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 100),
        loadTenantSettings: vi.fn(async () => ({ snitcherMonthlyCapUsd: 100 })),
        sumChargesThisMonth: vi.fn(async () => ({
          totalUsd: 0,
          rowCount: 0,
        })),
      },
    });
    // 100 × 0.06 = 6
    expect(decision.spendUsd).toBe(6);
  });

  it("uses ledger sum when ledger has rows", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 100),
        loadTenantSettings: vi.fn(async () => ({ snitcherMonthlyCapUsd: 100 })),
        sumChargesThisMonth: vi.fn(async () => ({
          totalUsd: 23.45,
          rowCount: 50,
        })),
      },
    });
    expect(decision.spendUsd).toBe(23.45);
  });

  it("ledger-reported spend over cap → reached=true", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 0),
        loadTenantSettings: vi.fn(async () => ({ snitcherMonthlyCapUsd: 50 })),
        sumChargesThisMonth: vi.fn(async () => ({
          totalUsd: 60,
          rowCount: 1000,
        })),
      },
    });
    expect(decision.spendUsd).toBe(60);
    expect(decision.reached).toBe(true);
  });

  it("backwards-compat : sumChargesThisMonth omitted → estimate path", async () => {
    const decision = await loadSpendDecision({
      tenantId: "t",
      deps: {
        countIdentificationsThisMonth: vi.fn(async () => 200),
        loadTenantSettings: vi.fn(async () => ({})),
      },
    });
    expect(decision.spendUsd).toBe(12); // 200 × 0.06
  });
});
