import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  pendingInvites: {
    id: "id",
    tenantId: "tenantId",
    email: "email",
    role: "role",
    token: "token",
    status: "status",
    expiresAt: "expiresAt",
    acceptedAt: "acceptedAt",
    acceptedByUserId: "acceptedByUserId",
    updatedAt: "updatedAt",
  },
  users: {
    id: "id",
    email: "email",
    tenantId: "tenantId",
    role: "role",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  ne: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/auth/invite/accept/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "old-tenant",
  appUserId: "u1",
  role: "member" as const,
};

function inviteRow(overrides: Partial<{ status: string; expiresAt: Date; email: string }> = {}) {
  return {
    id: "inv-1",
    tenantId: "new-tenant",
    email: "bob@acme.com",
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/auth/invite/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/auth/invite/accept", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(401);
  });

  it("400 when body is not JSON", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const req = new Request("http://localhost/api/auth/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("400 when token missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("404 when invite not found", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([]); // pendingInvites lookup returns []
    const res = await mod.POST(makeReq({ token: "nope" }));
    expect(res.status).toBe(404);
  });

  it("410 when invite already accepted", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([inviteRow({ status: "accepted" })]);
    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(410);
  });

  it("410 + side-effect when invite expired", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([inviteRow({ expiresAt: new Date(Date.now() - 1000) })]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(410);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" })
    );
  });

  it("403 when signed-in user email doesn't match invite", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([inviteRow()]);
    mockSelectOnce([{ id: "u1", email: "alice@acme.com" }]);
    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(403);
  });

  it("404 when user record missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([inviteRow()]);
    mockSelectOnce([]); // user lookup empty
    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(404);
  });

  it("happy path: switches tenant+role, marks invite accepted, returns requiresReauth", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([inviteRow()]); // invite
    mockSelectOnce([{ id: "u1", email: "BOB@ACME.COM" }]); // user (case-insensitive match)

    const updateCalls: Array<Record<string, unknown>> = [];
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      updateCalls.push(vals);
      return { where: updateWhere };
    });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe("new-tenant");
    expect(body.requiresReauth).toBe(true);
    // Two updates: users.tenantId/role and pendingInvites.status
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0]).toMatchObject({ tenantId: "new-tenant", role: "member" });
    expect(updateCalls[1]).toMatchObject({ status: "accepted", acceptedByUserId: "u1" });
  });

  it("solo admin (no other member) CAN accept — the old workspace goes dormant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authCtx, role: "admin" });
    mockSelectOnce([inviteRow()]); // invite
    mockSelectOnce([{ id: "u1", email: "bob@acme.com" }]); // user
    mockSelectOnce([]); // anotherMember lookup -> nobody else in the workspace

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe("new-tenant");
  });

  it("409 when the sole admin leaves a workspace that still has members", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authCtx, role: "admin" });
    mockSelectOnce([inviteRow()]); // invite
    mockSelectOnce([{ id: "u1", email: "bob@acme.com" }]); // user
    mockSelectOnce([{ id: "u2" }]); // anotherMember -> someone would be stranded
    mockSelectOnce([]); // anotherAdmin -> none

    const res = await mod.POST(makeReq({ token: "x" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/only admin/i);
  });
});
