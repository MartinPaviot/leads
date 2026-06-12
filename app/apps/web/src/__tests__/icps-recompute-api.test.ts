/**
 * POST /api/icps/recompute — the "Score all accounts" trigger behind
 * the accounts-header More menu. Contracts under test:
 *   - auth + rate-limit gates run before any work;
 *   - the R3.4 guard surfaces "nothing scorable" as a 422 instead of
 *     enqueuing a run the job would silently skip;
 *   - success fires `icp/recompute-tenant` for the caller's tenant;
 *   - a failed enqueue is a 502, never a fake "started".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/icp/fit-recompute-core", () => ({
  loadActiveIcps: vi.fn(),
  hasScorableCriteria: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { loadActiveIcps, hasScorableCriteria } from "@/lib/icp/fit-recompute-core";
import { inngest } from "@/inngest/client";

const { POST } = await import("@/app/api/icps/recompute/route");

const AUTH_CTX = { userId: "u1", appUserId: "au1", tenantId: "t1", role: "admin" };
const SCORABLE_ICP = {
  id: "icp1",
  priority: 1,
  criteria: [
    { id: "c1", fieldKey: "industry", operator: "eq", value: "software", weight: 1, isRequired: false },
  ],
};

describe("POST /api/icps/recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthContext).mockResolvedValue(AUTH_CTX as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(loadActiveIcps).mockResolvedValue([SCORABLE_ICP] as never);
    vi.mocked(hasScorableCriteria).mockReturnValue(true);
    vi.mocked(inngest.send).mockResolvedValue({ ids: [] } as never);
  });

  it("returns 401 when not authenticated and enqueues nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response untouched when limited", async () => {
    const limited = Response.json({ error: "Too many requests" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(limited);
    const res = await POST();
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("bulk", "u1");
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("returns 422 when no active ICP has scorable criteria — no enqueue", async () => {
    vi.mocked(hasScorableCriteria).mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/ICP/);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("fires icp/recompute-tenant for the caller's tenant on success", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ started: true, icps: 1 });
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      name: "icp/recompute-tenant",
      data: { tenantId: "t1" },
    });
  });

  it("returns 502 when the enqueue fails — the send IS the action", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest unreachable"));
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/re-score/i);
    consoleSpy.mockRestore();
  });
});
