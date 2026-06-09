import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DELETE /api/opportunities/[id] — deal cascade wiring.
 *
 * Covers auth (401), permission (403 for viewers), 404, the plain delete, and
 * that the `cascade` body is filtered to valid DealCascadeType values before
 * it reaches cascadeSoftDeleteDeal. The deal + its cascade share ONE delete
 * timestamp so a later restore is symmetric.
 */

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  deals: { id: "id", name: "name", tenantId: "tenantId", deletedAt: "deletedAt" },
  companies: {},
  activities: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(() => "isNull"),
}));
vi.mock("@/lib/infra/audit-log", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/infra/api-errors", () => ({
  apiError: vi.fn((code: string, msg: string) =>
    Response.json({ error: msg, code }, { status: code === "NOT_FOUND" ? 404 : 400 }),
  ),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/deals/cascade-delete", () => ({
  DEAL_CASCADE_TYPES: ["activities", "notes", "tasks"],
  cascadeSoftDeleteDeal: vi.fn().mockResolvedValue({}),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { cascadeSoftDeleteDeal } from "@/lib/deals/cascade-delete";

const mod = await import("@/app/api/opportunities/[id]/route");

const admin = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" as const };
const viewer = { userId: "u2", tenantId: "t1", appUserId: "u2", role: "viewer" as const };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/opportunities/dl1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const params = () => Promise.resolve({ id: "dl1" });

function mockExistence(rows: Array<{ id: string; name: string | null }>) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
}

/** db.update().set().where() resolves — the deal soft-delete write. */
function mockUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
}

beforeEach(() => { vi.clearAllMocks(); mockUpdate(); });

describe("DELETE /api/opportunities/[id]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(401);
  });

  it("403 when caller is a viewer (lacks deals:delete)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(viewer);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("404 when the deal does not exist for this tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([]);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("plain delete (no body): soft-deletes the deal, no cascade", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([{ id: "dl1", name: "Acme expansion" }]);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "dl1", cascaded: {} });
    expect(cascadeSoftDeleteDeal).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("filters the cascade list to valid types + shares the delete timestamp", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([{ id: "dl1", name: "Acme expansion" }]);
    vi.mocked(cascadeSoftDeleteDeal).mockResolvedValue({ activities: 2, tasks: 1 });
    const res = await mod.DELETE(makeReq({ cascade: ["activities", "tasks", "contacts", "bogus"] }), { params: params() });
    expect(res.status).toBe(200);
    // "contacts" is not a valid DealCascadeType; neither is "bogus". 4th arg = shared timestamp.
    expect(cascadeSoftDeleteDeal).toHaveBeenCalledWith("t1", "dl1", ["activities", "tasks"], expect.any(Date));
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "dl1", cascaded: { activities: 2, tasks: 1 } });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
