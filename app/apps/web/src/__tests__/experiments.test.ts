import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSettingsMock, updateSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  updateTenantSettings: (tenantId: string, updates: Record<string, unknown>) =>
    updateSettingsMock(tenantId, updates),
}));

const {
  isFlagEnabled,
  getFlagsForTenant,
  KNOWN_FLAGS,
} = await import("@/lib/experiments");

beforeEach(() => {
  getSettingsMock.mockReset();
  updateSettingsMock.mockReset();
});

describe("isFlagEnabled — post-WS-5 defaults-on", () => {
  it("returns FLAG_DEFAULTS[flag] when the tenant has no experiments map", async () => {
    getSettingsMock.mockResolvedValue({});
    // Post-WS-5 the v2 flags default to true, so a fresh tenant
    // without explicit settings sees v2 behavior.
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(true);
  });

  it("explicit setting wins over FLAG_DEFAULTS (true → true)", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": true },
    });
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(true);
  });

  it("explicit setting wins over FLAG_DEFAULTS (false → false)", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": false },
    });
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(false);
  });
});

describe("getFlagsForTenant", () => {
  it("returns every KNOWN_FLAGS key with a boolean value, defaults applied", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": false },
    });
    const map = await getFlagsForTenant("t1");
    for (const flag of KNOWN_FLAGS) {
      expect(typeof map[flag]).toBe("boolean");
    }
    // Explicit-false wins.
    expect(map["onboarding.v2.confirmation-card"]).toBe(false);
    // No explicit setting → FLAG_DEFAULTS (true).
    expect(map["onboarding.v2.warm-lead-prompt"]).toBe(true);
  });

  it("coerces unknown truthy values to boolean true", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.warm-lead-prompt": "yes" as unknown as boolean },
    });
    const map = await getFlagsForTenant("t1");
    expect(map["onboarding.v2.warm-lead-prompt"]).toBe(true);
  });
});
