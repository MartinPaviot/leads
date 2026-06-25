import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  withAuthRLS: vi.fn((cb: (ctx: unknown) => unknown) =>
    cb({ tenantId: "t1", appUserId: "u1" }),
  ),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  updateTenantSettings: vi.fn(async () => {}),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn(async () => {}),
}));

import { updateTenantSettings } from "@/lib/config/tenant-settings";
import { logAudit } from "@/lib/infra/audit-log";

const route = await import("@/app/api/calls/recording-setting/route");

function post(body: unknown) {
  return new Request("http://x/api/calls/recording-setting", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/calls/recording-setting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables the workspace toggle and writes an audit entry", async () => {
    const res = await route.POST(post({ enabled: true }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true, enabled: true });
    expect(updateTenantSettings).toHaveBeenCalledWith("t1", {
      callRecordingEnabled: true,
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        action: "update",
        entityId: "call_recording",
        metadata: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it("disables the toggle", async () => {
    const res = await route.POST(post({ enabled: false }));
    expect(res.status).toBe(200);
    expect(updateTenantSettings).toHaveBeenCalledWith("t1", {
      callRecordingEnabled: false,
    });
  });

  it("rejects a malformed body with 400", async () => {
    const res = await route.POST(post({ enabled: "yes" }));
    expect(res.status).toBe(400);
    expect(updateTenantSettings).not.toHaveBeenCalled();
  });
});
