import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSettingsMock,
  updateSettingsMock,
  tenantsSelectMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  tenantsSelectMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  updateTenantSettings: (
    tenantId: string,
    updates: Record<string, unknown>,
  ) => updateSettingsMock(tenantId, updates),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => tenantsSelectMock(),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id" },
}));

vi.mock("@/lib/observability/logger", () => {
  const logger = {
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: logger, logger };
});

const {
  migrateTenant,
  migrateAllTenants,
  __internal,
} = await import("@/lib/migrations/ws-1-guardrail-defaults");

beforeEach(() => {
  getSettingsMock.mockReset();
  updateSettingsMock.mockReset();
  tenantsSelectMock.mockReset();
  loggerWarnMock.mockReset();
});

describe("remapApprovalMode", () => {
  const { remapApprovalMode } = __internal;

  it.each([
    ["auto", "auto-high-confidence"],
    ["ask", "review-each"],
    ["manual", "review-each"],
    ["off", "review-each"],
    [undefined, "review-each"],
    [null, "review-each"],
    // v2 values pass through unchanged for idempotency.
    ["review-each", "review-each"],
    ["batch-daily", "batch-daily"],
    ["auto-high-confidence", "auto-high-confidence"],
    // Future / unknown strings default to the conservative rail.
    ["unknown-future-mode" as unknown as undefined, "review-each"],
  ])("remaps %s → %s", (input, expected) => {
    expect(remapApprovalMode(input as never)).toBe(expected);
  });
});

describe("migrateTenant dry-run", () => {
  it("reports what would change without writing", async () => {
    getSettingsMock.mockResolvedValue({
      agentApprovalMode: "auto",
      // Every other WS-1 field is absent, simulating a legacy tenant.
    });

    const result = await migrateTenant("tenant-1", { dryRun: true });

    expect(result.status).toBe("dry-run");
    expect(result.previousMode).toBe("auto");
    expect(result.newMode).toBe("auto-high-confidence");
    expect(result.migrationBannerNeeded).toBe(true);
    expect(result.seededKeys).toEqual(
      expect.arrayContaining([
        "agentApprovalMode",
        "sendingMailboxMode",
        "sendingDailyCapPrimary",
        "sendingAllowColdOnPrimary",
        "trustScore",
        "autonomyNudgeState",
        "agentMemoryPanelDiscovered",
        "llmMonthlyCostCapUsd",
      ]),
    );
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("returns status=skipped when ws1MigrationRanAt is already set", async () => {
    getSettingsMock.mockResolvedValue({
      ws1MigrationRanAt: "2026-04-21T10:00:00.000Z",
      agentApprovalMode: "review-each",
    });

    const result = await migrateTenant("tenant-1", { dryRun: true });

    expect(result.status).toBe("skipped");
    expect(result.seededKeys).toEqual([]);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });
});

describe("migrateTenant execute", () => {
  it("writes updates + stamps ws1MigrationRanAt", async () => {
    getSettingsMock.mockResolvedValue({
      agentApprovalMode: "auto",
    });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await migrateTenant("tenant-1", { dryRun: false });

    expect(result.status).toBe("migrated");
    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
    const [tenantId, updates] = updateSettingsMock.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(updates.agentApprovalMode).toBe("auto-high-confidence");
    expect(updates.sendingMailboxMode).toBe("primary-with-caps");
    expect(updates.sendingDailyCapPrimary).toBe(20);
    expect(updates.sendingAllowColdOnPrimary).toBe(false);
    expect(updates.trustScore).toBe(0);
    expect(updates.agentMemoryPanelDiscovered).toBe(false);
    expect(updates.llmMonthlyCostCapUsd).toBe(50);
    expect(typeof updates.ws1MigrationRanAt).toBe("string");
  });

  it("does not clobber a user-set cap", async () => {
    getSettingsMock.mockResolvedValue({
      agentApprovalMode: "ask",
      llmMonthlyCostCapUsd: 500,
      sendingMailboxMode: "external-connected", // user already configured
    });
    updateSettingsMock.mockResolvedValue(undefined);

    await migrateTenant("tenant-1", { dryRun: false });

    const [, updates] = updateSettingsMock.mock.calls[0];
    // llmMonthlyCostCapUsd is present (500) → we skip seeding.
    expect(updates.llmMonthlyCostCapUsd).toBeUndefined();
    // Same for sendingMailboxMode.
    expect(updates.sendingMailboxMode).toBeUndefined();
  });

  it("does not flag migrationBannerNeeded for ask/manual tenants", async () => {
    getSettingsMock.mockResolvedValue({ agentApprovalMode: "ask" });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await migrateTenant("tenant-1", { dryRun: false });

    expect(result.migrationBannerNeeded).toBe(false);
    expect(result.newMode).toBe("review-each");
  });

  it("handles the no-prior-mode case gracefully", async () => {
    getSettingsMock.mockResolvedValue({});
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await migrateTenant("tenant-1", { dryRun: false });

    expect(result.previousMode).toBeNull();
    expect(result.newMode).toBe("review-each");
    expect(result.migrationBannerNeeded).toBe(false);
  });
});

describe("migrateAllTenants", () => {
  it("returns a report with per-tenant results", async () => {
    tenantsSelectMock.mockResolvedValue([
      { id: "t1" },
      { id: "t2" },
      { id: "t3" },
    ]);
    getSettingsMock.mockImplementation(async (tenantId: string) => {
      if (tenantId === "t1") return { agentApprovalMode: "auto" };
      if (tenantId === "t2") return { ws1MigrationRanAt: "2026-04-20T00:00:00.000Z" };
      return {}; // t3 → no prior mode
    });
    updateSettingsMock.mockResolvedValue(undefined);

    const report = await migrateAllTenants({ dryRun: false, batchSize: 2, delayMsBetweenBatches: 0 });

    expect(report.totalTenants).toBe(3);
    expect(report.migrated).toBe(2);
    expect(report.skipped).toBe(1);
    expect(report.perTenant.map((r) => r.tenantId).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("does not write in dry-run mode", async () => {
    tenantsSelectMock.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    getSettingsMock.mockResolvedValue({ agentApprovalMode: "auto" });

    const report = await migrateAllTenants({ dryRun: true, delayMsBetweenBatches: 0 });

    expect(report.dryRun).toBe(true);
    expect(updateSettingsMock).not.toHaveBeenCalled();
    for (const r of report.perTenant) expect(r.status).toBe("dry-run");
  });

  it("continues the batch if one tenant throws", async () => {
    tenantsSelectMock.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    getSettingsMock.mockImplementation(async (tenantId: string) => {
      if (tenantId === "t1") throw new Error("DB blip");
      return { agentApprovalMode: "ask" };
    });
    updateSettingsMock.mockResolvedValue(undefined);

    const report = await migrateAllTenants({ dryRun: false, delayMsBetweenBatches: 0 });

    expect(report.totalTenants).toBe(2);
    // t1 failed → counted as skipped. t2 migrated.
    expect(report.migrated).toBe(1);
    expect(report.skipped).toBe(1);
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
