import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

// We have to mock before importing the module-under-test because it
// calls the real db/tenant-settings layer on import paths.
vi.mock("@/lib/cost-tracker", () => ({
  getTenantCost: vi.fn(),
}));
vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(),
}));

import {
  BudgetExceededError,
  clearBudgetCacheForTest,
  enforceLlmBudget,
  getLlmBudgetStatus,
  invalidateBudgetCache,
} from "@/lib/llm-budget";
import { getTenantCost } from "@/lib/cost-tracker";
import { getTenantSettings } from "@/lib/tenant-settings";

const mockedGetTenantCost = vi.mocked(getTenantCost);
const mockedGetTenantSettings = vi.mocked(getTenantSettings);

describe("llm-budget", () => {
  beforeEach(() => {
    clearBudgetCacheForTest();
    mockedGetTenantCost.mockReset();
    mockedGetTenantSettings.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no cap configured → always allowed, aggregation is skipped", async () => {
    mockedGetTenantSettings.mockResolvedValue({} as Awaited<ReturnType<typeof getTenantSettings>>);
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(true);
    expect(status.capUsd).toBe(0);
    expect(status.percentUsed).toBeNull();
    expect(mockedGetTenantCost).not.toHaveBeenCalled();
  });

  it("cap set to 0 treated as no cap", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 0 } as Awaited<ReturnType<typeof getTenantSettings>>);
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(true);
    expect(mockedGetTenantCost).not.toHaveBeenCalled();
  });

  it("under cap → allowed with percentUsed reported", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 50 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 12.34, totalTokens: 1_000_000, byFeature: {} });
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(true);
    expect(status.spentUsd).toBeCloseTo(12.34);
    expect(status.capUsd).toBe(50);
    expect(status.percentUsed).toBeCloseTo((12.34 / 50) * 100);
    expect(status.reason).toBeUndefined();
  });

  it("over cap → not allowed with human-readable reason", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 10 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 11.5, totalTokens: 0, byFeature: {} });
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(false);
    expect(status.reason).toMatch(/Monthly AI budget cap/);
    expect(status.reason).toContain("$11.50");
    expect(status.reason).toContain("$10.00");
  });

  it("exactly at cap → not allowed (spent >= cap)", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 10 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 10, totalTokens: 0, byFeature: {} });
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(false);
  });

  it("enforceLlmBudget throws BudgetExceededError when over cap", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 5 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 10, totalTokens: 0, byFeature: {} });
    await expect(enforceLlmBudget("t1")).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("enforceLlmBudget no-ops when tenantId is undefined (infra calls)", async () => {
    await expect(enforceLlmBudget(undefined)).resolves.toBeUndefined();
    expect(mockedGetTenantSettings).not.toHaveBeenCalled();
  });

  it("fails open when getTenantSettings throws", async () => {
    mockedGetTenantSettings.mockRejectedValue(new Error("db down"));
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(true);
    expect(status.capUsd).toBe(0);
  });

  it("fails open when cost aggregation throws (cap configured but read failed)", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 50 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockRejectedValue(new Error("usage_events unavailable"));
    const status = await getLlmBudgetStatus("t1");
    expect(status.allowed).toBe(true);
    expect(status.percentUsed).toBeNull();
  });

  it("caches within 30s TTL — second call hits cache, not the DB", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 50 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 10, totalTokens: 0, byFeature: {} });
    await getLlmBudgetStatus("t1");
    await getLlmBudgetStatus("t1");
    await getLlmBudgetStatus("t1");
    expect(mockedGetTenantCost).toHaveBeenCalledTimes(1);
    expect(mockedGetTenantSettings).toHaveBeenCalledTimes(1);
  });

  it("invalidateBudgetCache forces a re-read", async () => {
    mockedGetTenantSettings.mockResolvedValue({ llmMonthlyCostCapUsd: 50 } as Awaited<ReturnType<typeof getTenantSettings>>);
    mockedGetTenantCost.mockResolvedValue({ totalCost: 10, totalTokens: 0, byFeature: {} });
    await getLlmBudgetStatus("t1");
    invalidateBudgetCache("t1");
    await getLlmBudgetStatus("t1");
    expect(mockedGetTenantCost).toHaveBeenCalledTimes(2);
  });

  it("separate tenants don't share cache entries", async () => {
    mockedGetTenantSettings.mockImplementation(async (tid) => {
      if (tid === "t1") return { llmMonthlyCostCapUsd: 10 } as Awaited<ReturnType<typeof getTenantSettings>>;
      return { llmMonthlyCostCapUsd: 100 } as Awaited<ReturnType<typeof getTenantSettings>>;
    });
    mockedGetTenantCost.mockResolvedValue({ totalCost: 20, totalTokens: 0, byFeature: {} });
    const t1 = await getLlmBudgetStatus("t1");
    const t2 = await getLlmBudgetStatus("t2");
    expect(t1.allowed).toBe(false);
    expect(t2.allowed).toBe(true);
  });
});
