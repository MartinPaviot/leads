import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id" },
  users: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

const updateSettingsMock = vi.fn();
vi.mock("@/lib/tenant-settings", () => ({
  updateTenantSettings: (tenantId: string, updates: Record<string, unknown>) =>
    updateSettingsMock(tenantId, updates),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getAuthContext } from "@/lib/auth-utils";

const saveModule = await import("@/app/api/onboarding/save/route");

function makeReq(body: unknown) {
  return new Request("http://localhost/api/onboarding/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/onboarding/save — currentStep persistence (T0.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await saveModule.POST(makeReq({ step: "_current", currentStep: "product" }));
    expect(res.status).toBe(401);
  });

  it("persists onboardingCurrentStep on `_current` position update", async () => {
    const res = await saveModule.POST(
      makeReq({ step: "_current", currentStep: "product" })
    );
    expect(res.status).toBe(200);
    expect(updateSettingsMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ onboardingCurrentStep: "product" })
    );
  });

  it("is a no-op when `_current` arrives without currentStep", async () => {
    const res = await saveModule.POST(makeReq({ step: "_current" }));
    expect(res.status).toBe(200);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("persists currentStep alongside per-step payloads", async () => {
    const res = await saveModule.POST(
      makeReq({
        step: "product",
        productDesc: "AI CRM",
        salesMotion: "Founder-led sales",
        challenge: "Finding leads",
        currentStep: "product",
      })
    );
    expect(res.status).toBe(200);
    expect(updateSettingsMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        productDescription: "AI CRM",
        primaryChallenge: "Finding leads",
        onboardingCurrentStep: "product",
      })
    );
  });

  it("clears onboardingCurrentStep on completion", async () => {
    const res = await saveModule.POST(
      makeReq({ step: "complete", onboardingCompleted: true })
    );
    expect(res.status).toBe(200);
    expect(updateSettingsMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        onboardingCompleted: true,
        onboardingCurrentStep: undefined,
      })
    );
  });
});
