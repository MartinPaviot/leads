import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  requireAdmin: vi.fn(),
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
    status: "status",
    sentAt: "sentAt",
    lastSentAt: "lastSentAt",
    expiresAt: "expiresAt",
    resendCount: "resendCount",
    token: "token",
    updatedAt: "updatedAt",
  },
  users: { id: "id", firstName: "firstName", lastName: "lastName", email: "email" },
  tenants: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/email-invite", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";

const listMod = await import("@/app/api/settings/members/invites/route");
const mgmtMod = await import("@/app/api/settings/members/invites/[id]/route");

const authAdmin = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

function mockSelectOnce(rows: unknown[], opts: { ordered?: boolean } = {}) {
  const finalFn = vi.fn().mockResolvedValue(rows);
  if (opts.ordered) {
    const whereFn = vi.fn().mockReturnValue({ orderBy: finalFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
  } else {
    const whereFn = vi.fn().mockReturnValue({ limit: finalFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
  }
}

describe("GET /api/settings/members/invites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await listMod.GET();
    expect(res.status).toBe(401);
  });

  it("returns invites scoped to tenant + status pending", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce(
      [
        { id: "i1", email: "bob@acme.com", role: "member", status: "pending" },
        { id: "i2", email: "carol@acme.com", role: "admin", status: "pending" },
      ],
      { ordered: true }
    );

    const res = await listMod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invites).toHaveLength(2);
  });
});

function mgmtReq(method: string, body?: unknown) {
  return new Request("http://localhost/api/settings/members/invites/inv-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const idParam = { params: Promise.resolve({ id: "inv-1" }) };

describe("DELETE /api/settings/members/invites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockReturnValue(null);
  });

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mgmtMod.DELETE(mgmtReq("DELETE"), idParam);
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authAdmin, role: "member" });
    vi.mocked(requireAdmin).mockReturnValue(
      Response.json({ error: "Admin access required" }, { status: 403 }) as never
    );
    const res = await mgmtMod.DELETE(mgmtReq("DELETE"), idParam);
    expect(res.status).toBe(403);
  });

  it("404 when no pending invite matches", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await mgmtMod.DELETE(mgmtReq("DELETE"), idParam);
    expect(res.status).toBe(404);
  });

  it("200 + soft-deletes the invite", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const returningFn = vi.fn().mockResolvedValue([{ id: "inv-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await mgmtMod.DELETE(mgmtReq("DELETE"), idParam);
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" })
    );
  });
});

describe("POST /api/settings/members/invites/[id] (resend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockReturnValue(null);
  });

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mgmtMod.POST(mgmtReq("POST"), idParam);
    expect(res.status).toBe(401);
  });

  it("404 when invite doesn't exist", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]);
    const res = await mgmtMod.POST(mgmtReq("POST"), idParam);
    expect(res.status).toBe(404);
  });

  it("400 when invite is already accepted/cancelled", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([
      { id: "inv-1", status: "accepted", resendCount: 0, role: "member", email: "bob@acme.com", expiresAt: new Date(), token: "x" },
    ]);
    const res = await mgmtMod.POST(mgmtReq("POST"), idParam);
    expect(res.status).toBe(400);
  });

  it("429 when resend limit reached", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([
      { id: "inv-1", status: "pending", resendCount: 3, role: "member", email: "bob@acme.com", expiresAt: new Date(), token: "x" },
    ]);
    const res = await mgmtMod.POST(mgmtReq("POST"), idParam);
    expect(res.status).toBe(429);
  });

  it("200 + increments resendCount on happy path", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([
      { id: "inv-1", status: "pending", resendCount: 1, role: "member", email: "bob@acme.com", expiresAt: new Date(), token: "x" },
    ]);
    mockSelectOnce([{ id: "t1", name: "Acme" }]); // tenant
    mockSelectOnce([{ email: "alice@acme.com" }]); // inviter

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await mgmtMod.POST(mgmtReq("POST"), idParam);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resendCount).toBe(2);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ resendCount: 2 })
    );
  });
});
