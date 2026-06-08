import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DELETE /api/accounts/[id] — the cascade wiring around the soft-delete.
 *
 * Covers auth (401), permission (403 for viewers), 404 for a missing/foreign
 * account, the plain delete (no cascade), and — the security-relevant part —
 * that the `cascade` body is filtered to valid CascadeType values before it
 * reaches cascadeSoftDeleteCompany (so a client can't pass arbitrary strings).
 */

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  companies: { id: "id", name: "name", tenantId: "tenantId", deletedAt: "deletedAt" },
  deals: {},
  contacts: {},
  activities: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(() => "sql"),
  isNull: vi.fn(() => "isNull"),
}));
vi.mock("@/lib/infra/soft-delete", () => ({ softDelete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/infra/audit-log", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/accounts/cascade-delete", () => ({
  CASCADE_TYPES: ["contacts", "deals", "activities", "notes", "tasks"],
  cascadeSoftDeleteCompany: vi.fn().mockResolvedValue({}),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { softDelete } from "@/lib/infra/soft-delete";
import { logAudit } from "@/lib/infra/audit-log";
import { cascadeSoftDeleteCompany } from "@/lib/accounts/cascade-delete";

const mod = await import("@/app/api/accounts/[id]/route");

const admin = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" as const };
const viewer = { userId: "u2", tenantId: "t1", appUserId: "u2", role: "viewer" as const };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/accounts/co1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const params = () => Promise.resolve({ id: "co1" });

/** db.select().from().where().limit() resolves to `rows`. */
function mockExistence(rows: Array<{ id: string; name: string | null }>) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/accounts/[id]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(401);
  });

  it("403 when caller is a viewer (lacks companies:delete)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(viewer);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(403);
    expect(cascadeSoftDeleteCompany).not.toHaveBeenCalled();
    expect(softDelete).not.toHaveBeenCalled();
  });

  it("404 when the account does not exist for this tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([]);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(404);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it("plain delete (no body): soft-deletes the company, no cascade", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([{ id: "co1", name: "Acme" }]);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "co1", cascaded: {} });
    expect(cascadeSoftDeleteCompany).not.toHaveBeenCalled();
    expect(softDelete).toHaveBeenCalledWith("companies", "co1", "t1");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        entityType: "company",
        entityId: "co1",
        metadata: expect.objectContaining({ name: "Acme", softDeleted: true, cascaded: {} }),
      }),
    );
  });

  it("filters the cascade list to valid types before deleting", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([{ id: "co1", name: "Acme" }]);
    vi.mocked(cascadeSoftDeleteCompany).mockResolvedValue({ contacts: 3, deals: 1 });

    // "bogus" and the number must be dropped; only contacts + deals survive.
    const res = await mod.DELETE(makeReq({ cascade: ["contacts", "deals", "bogus", 42] }), { params: params() });
    expect(res.status).toBe(200);
    expect(cascadeSoftDeleteCompany).toHaveBeenCalledWith("t1", "co1", ["contacts", "deals"]);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "co1", cascaded: { contacts: 3, deals: 1 } });
    // Company itself is still soft-deleted after the cascade.
    expect(softDelete).toHaveBeenCalledWith("companies", "co1", "t1");
  });

  it("ignores a non-array cascade value (treats as no cascade)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockExistence([{ id: "co1", name: "Acme" }]);
    const res = await mod.DELETE(makeReq({ cascade: "contacts" }), { params: params() });
    expect(res.status).toBe(200);
    expect(cascadeSoftDeleteCompany).not.toHaveBeenCalled();
    expect(softDelete).toHaveBeenCalledWith("companies", "co1", "t1");
  });
});
