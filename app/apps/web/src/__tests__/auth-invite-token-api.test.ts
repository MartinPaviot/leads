import { describe, it, expect, vi, beforeEach } from "vitest";

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
    updatedAt: "updatedAt",
  },
  tenants: {
    id: "id",
    name: "name",
  },
  authUsers: {
    id: "id",
    email: "email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { db } from "@/db";

const mod = await import("@/app/api/auth/invite/[token]/route");

function inviteRow(overrides: Partial<{ status: string; expiresAt: Date }> = {}) {
  return {
    id: "inv-1",
    tenantId: "t1",
    email: "bob@acme.com",
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000), // tomorrow
    ...overrides,
  };
}

function mockSelect(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function makeReq() {
  return new Request("http://localhost/api/auth/invite/abc");
}

describe("GET /api/auth/invite/[token]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 when token is empty", async () => {
    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("missing_token");
  });

  it("404 when no invite matches the token", async () => {
    mockSelect([]);
    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "nope" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("not_found");
  });

  it("410 with cancelled status when invite is cancelled", async () => {
    mockSelect([inviteRow({ status: "cancelled" })]);
    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "x" }) });
    expect(res.status).toBe(410);
    expect((await res.json()).reason).toBe("cancelled");
  });

  it("410 + side-effect updates status when invite expired", async () => {
    mockSelect([inviteRow({ expiresAt: new Date(Date.now() - 1000) })]);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "x" }) });
    expect(res.status).toBe(410);
    expect((await res.json()).reason).toBe("expired");
    // Side effect: invite is marked `expired` to stop listing it.
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" })
    );
  });

  it("200 + invite payload when valid (hasAccount false when no account)", async () => {
    mockSelect([inviteRow()]);
    mockSelect([{ name: "Acme Inc." }]);
    mockSelect([]); // no auth user for this email → hasAccount false

    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "x" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.invite.email).toBe("bob@acme.com");
    expect(body.invite.role).toBe("member");
    expect(body.invite.workspace).toBe("Acme Inc.");
    expect(typeof body.invite.expiresAt).toBe("string");
    expect(body.invite.hasAccount).toBe(false);
  });

  it("hasAccount true when the invited email already has an account", async () => {
    mockSelect([inviteRow()]);
    mockSelect([{ name: "Acme Inc." }]);
    mockSelect([{ id: "auth-user-1" }]); // existing auth user

    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "x" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite.hasAccount).toBe(true);
  });

  it("falls back to a generic workspace label when tenant lookup is empty", async () => {
    mockSelect([inviteRow()]);
    mockSelect([]); // no tenant row
    mockSelect([]); // no auth user

    const res = await mod.GET(makeReq(), { params: Promise.resolve({ token: "x" }) });
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.invite.workspace).toBe("the workspace");
  });
});
