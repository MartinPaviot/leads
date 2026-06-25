import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
  requireAdmin: (ctx: { role?: string } | null) => (ctx?.role === "admin" ? null : Response.json({ error: "Admin only" }, { status: 403 })),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  authUsers: { id: "id" },
  authAccounts: { userId: "userId" },
  authSessions: { userId: "userId" },
  users: { id: "id", clerkId: "clerkId", tenantId: "tenantId", email: "email", firstName: "firstName", lastName: "lastName", role: "role", createdAt: "createdAt" },
  tenants: { id: "id" },
  contacts: { tenantId: "tenantId" },
  companies: { tenantId: "tenantId" },
  deals: { tenantId: "tenantId" },
  activities: { tenantId: "tenantId" },
  notes: { tenantId: "tenantId" },
  tasks: { tenantId: "tenantId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const accountMod = await import("@/app/api/account/route");
const exportMod = await import("@/app/api/gdpr/export/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "member" as const,
};
// gdpr/export is admin-only (full-workspace export); the export GET tests
// authenticate as admin. Member -> 403 is covered in admin-get-gates.test.ts.
const adminCtx = { ...authCtx, role: "admin" as const };

function jsonReq(body?: unknown, method: string = "DELETE") {
  return new Request("http://localhost/api/account", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ============================================================
// DELETE /api/account
// ============================================================

describe("DELETE /api/account", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await accountMod.DELETE(jsonReq({ confirm: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("400 when confirm token missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await accountMod.DELETE(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it("400 when confirm token wrong (case-sensitive)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await accountMod.DELETE(jsonReq({ confirm: "delete" }));
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON body", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const req = new Request("http://localhost/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await accountMod.DELETE(req);
    expect(res.status).toBe(400);
  });

  it("happy path: deletes users + sessions + accounts + authUsers row", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhere } as never);

    const res = await accountMod.DELETE(jsonReq({ confirm: "DELETE" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    // 4 deletes: users, authSessions, authAccounts, authUsers
    expect(deleteWhere).toHaveBeenCalledTimes(4);
  });
});

// ============================================================
// GET /api/gdpr/export
// ============================================================

describe("GET /api/gdpr/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await exportMod.GET(new Request("http://localhost/api/gdpr/export"));
    expect(res.status).toBe(401);
  });

  it("404 when app-level user row not found", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(adminCtx);
    // First .from().where() resolves to []  → no user
    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);

    const res = await exportMod.GET(new Request("http://localhost/api/gdpr/export"));
    expect(res.status).toBe(404);
  });

  it("happy path: returns JSON download with all tenant data + counts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(adminCtx);

    // 1st select: users → returns the user row
    const userWhere = vi.fn().mockResolvedValue([
      {
        id: "u1",
        email: "bob@acme.com",
        firstName: "Bob",
        lastName: "Acme",
        role: "member",
        createdAt: new Date("2026-01-01"),
      },
    ]);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: userWhere }),
    } as never);

    // 6 parallel selects: contacts, companies, deals, activities, notes, tasks
    const tableRows = [
      [{ id: "c1" }, { id: "c2" }], // contacts
      [{ id: "co1" }],                // companies
      [],                             // deals
      [{ id: "a1" }, { id: "a2" }, { id: "a3" }], // activities
      [{ id: "n1" }],                 // notes
      [],                             // tasks
    ];
    for (const rows of tableRows) {
      const wF = vi.fn().mockResolvedValue(rows);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: wF }),
      } as never);
    }

    const res = await exportMod.GET(new Request("http://localhost/api/gdpr/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("elevay-export-");

    const body = JSON.parse(await res.text());
    expect(body.user.email).toBe("bob@acme.com");
    expect(body.metadata.counts).toEqual({
      contacts: 2,
      companies: 1,
      deals: 0,
      activities: 3,
      notes: 1,
      tasks: 0,
    });
    expect(body.data.contacts).toHaveLength(2);
    expect(body.data.activities).toHaveLength(3);
  });
});
