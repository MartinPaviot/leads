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

describe("isFlagEnabled", () => {
  it("returns false when the tenant has no experiments map", async () => {
    getSettingsMock.mockResolvedValue({});
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(false);
  });

  it("returns true when the flag is set", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": true },
    });
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(true);
  });

  it("returns false when the flag is set to false explicitly", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": false },
    });
    expect(
      await isFlagEnabled("t1", "onboarding.v2.confirmation-card"),
    ).toBe(false);
  });
});

describe("getFlagsForTenant", () => {
  it("returns every KNOWN_FLAGS key with a boolean value", async () => {
    getSettingsMock.mockResolvedValue({
      experiments: { "onboarding.v2.confirmation-card": true },
    });
    const map = await getFlagsForTenant("t1");
    for (const flag of KNOWN_FLAGS) {
      expect(typeof map[flag]).toBe("boolean");
    }
    expect(map["onboarding.v2.confirmation-card"]).toBe(true);
    expect(map["onboarding.v2.warm-lead-prompt"]).toBe(false);
  });

  it("coerces unknown truthy values to boolean true", async () => {
    getSettingsMock.mockResolvedValue({
      // Legacy value — someone set a non-boolean in the DB.
      experiments: { "onboarding.v2.warm-lead-prompt": "yes" as unknown as boolean },
    });
    const map = await getFlagsForTenant("t1");
    expect(map["onboarding.v2.warm-lead-prompt"]).toBe(true);
  });
});
