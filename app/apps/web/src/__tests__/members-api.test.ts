import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/fresh-role", () => ({
  invalidateRoleCache: vi.fn(),
}));

vi.mock("@/lib/auth/session-guard", () => ({
  invalidateSessionGuard: vi.fn(),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  users: {
    id: "id",
    tenantId: "tenantId",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
    role: "role",
    avatarUrl: "avatarUrl",
    createdAt: "createdAt",
    deactivatedAt: "deactivatedAt",
    clerkId: "clerkId",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn() }));

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { invalidateSessionGuard } from "@/lib/auth/session-guard";

const mod = await import("@/app/api/settings/members/route");

const authAdmin = { userId: "auth-1", tenantId: "t1", appUserId: "u1", role: "admin" as const };

function mockSelectRows(rows: unknown[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
}

function mockUpdateReturning(rows: unknown[]) {
  const returningFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
  return { setFn };
}

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/settings/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockReturnValue(null);
});

describe("GET /api/settings/members", () => {
  it("returns active members (deactivated are filtered by the query) and flags isSelf", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    // The route adds isNull(deactivatedAt) to the WHERE, so the DB returns only
    // active rows — the mock reflects that (no deactivated rows come back).
    mockSelectRows([
      { id: "u1", email: "me@acme.com", firstName: "Me", lastName: null, role: "admin", avatarUrl: null, createdAt: null },
      { id: "u2", email: "bob@acme.com", firstName: "Bob", lastName: null, role: "member", avatarUrl: null, createdAt: null },
    ]);
    const res = await mod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    const me = body.members.find((m: { id: string }) => m.id === "u1");
    const bob = body.members.find((m: { id: string }) => m.id === "u2");
    expect(me.isSelf).toBe(true);
    expect(bob.isSelf).toBe(false);
    // No deactivated state is surfaced anymore.
    expect(me).not.toHaveProperty("status");
  });
});

describe("DELETE /api/settings/members (revoke / restore access)", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq({ memberId: "u2" }));
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authAdmin, role: "member" });
    vi.mocked(requireAdmin).mockReturnValue(
      Response.json({ error: "Admin access required" }, { status: 403 }) as never,
    );
    const res = await mod.DELETE(makeReq({ memberId: "u2" }));
    expect(res.status).toBe(403);
  });

  it("400 when trying to remove your own access", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const res = await mod.DELETE(makeReq({ memberId: "u1" }));
    expect(res.status).toBe(400);
  });

  it("404 when the member is not in the caller's tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockUpdateReturning([]); // 0 rows -> not found / wrong tenant
    const res = await mod.DELETE(makeReq({ memberId: "ghost" }));
    expect(res.status).toBe(404);
  });

  it("revokes access: sets deactivatedAt and busts the session guard", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const { setFn } = mockUpdateReturning([{ id: "u2", clerkId: "auth-2" }]);
    const res = await mod.DELETE(makeReq({ memberId: "u2" }));
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ deactivatedAt: expect.any(Date) }),
    );
    expect(invalidateSessionGuard).toHaveBeenCalledWith("auth-2");
  });

  it("restores access: clears deactivatedAt when reactivate=true", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const { setFn } = mockUpdateReturning([{ id: "u2", clerkId: "auth-2" }]);
    const res = await mod.DELETE(makeReq({ memberId: "u2", reactivate: true }));
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ deactivatedAt: null }),
    );
  });
});
