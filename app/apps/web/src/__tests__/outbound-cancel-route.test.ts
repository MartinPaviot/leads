import { describe, it, expect, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const cancelHeldOutbound = vi.fn();

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: () => getAuthContext(),
}));
vi.mock("@/lib/emails/outbound-hold", () => ({
  cancelHeldOutbound: (...a: unknown[]) => cancelHeldOutbound(...a),
}));

import { POST } from "@/app/api/outbound/[id]/cancel/route";

const authCtx = { tenantId: "t1", userId: "u1", appUserId: "u1", role: "member" };

function call(id: string) {
  const req = new Request(`http://localhost/api/outbound/${id}/cancel`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getAuthContext.mockReset();
  cancelHeldOutbound.mockReset();
  getAuthContext.mockResolvedValue(authCtx);
});

describe("CLE-11 POST /api/outbound/[id]/cancel", () => {
  it("401 when unauthenticated", async () => {
    getAuthContext.mockResolvedValue(null);
    const res = await call("oe-1");
    expect(res.status).toBe(401);
    expect(cancelHeldOutbound).not.toHaveBeenCalled();
  });

  it("AC-10: cancels a held row for the owner (tenant-scoped)", async () => {
    cancelHeldOutbound.mockResolvedValue({ canceled: true });
    const res = await call("oe-1");
    const json = await res.json();
    expect(json.canceled).toBe(true);
    expect(cancelHeldOutbound).toHaveBeenCalledWith("t1", "oe-1");
  });

  it("AC-11/AC-16: 409 when the row is no longer held or belongs to another tenant", async () => {
    cancelHeldOutbound.mockResolvedValue({ canceled: false, reason: "already_sending_or_sent" });
    const res = await call("oe-2");
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.canceled).toBe(false);
  });
});
