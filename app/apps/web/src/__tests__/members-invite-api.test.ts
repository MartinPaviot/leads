import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
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
    sentAt: "sentAt",
    lastSentAt: "lastSentAt",
    resendCount: "resendCount",
    invitedByUserId: "invitedByUserId",
    updatedAt: "updatedAt",
  },
  users: {
    id: "id",
    tenantId: "tenantId",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
  },
  tenants: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/email-invite", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { sendInviteEmail } from "@/lib/email-invite";

const mod = await import("@/app/api/settings/members/invite/route");

const authAdmin = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/settings/members/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/settings/members/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockReturnValue(null);
    vi.mocked(sendInviteEmail).mockResolvedValue({ sent: true });
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authAdmin, role: "member" });
    vi.mocked(requireAdmin).mockReturnValue(
      Response.json({ error: "Admin access required" }, { status: 403 }) as never
    );
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(403);
  });

  it("400 on invalid email", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const res = await mod.POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    const req = new Request("http://localhost/api/settings/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("400 when target email is already a workspace member", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([{ id: "existing-user-id" }]); // existing member match
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(400);
  });

  it("404 when tenant lookup empty", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]); // no existing user
    mockSelectOnce([]); // no tenant
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(404);
  });

  it("creates a new invite + sends email + 201", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]); // no existing user
    mockSelectOnce([{ id: "t1", name: "Acme" }]); // tenant
    mockSelectOnce([
      { firstName: "Alice", lastName: "Founder", email: "alice@acme.com" },
    ]); // inviter
    mockSelectOnce([]); // no existing pending invite

    const returningFn = vi.fn().mockResolvedValue([{ id: "new-invite-id" }]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(makeReq({ email: "bob@acme.com", role: "member" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invite.id).toBe("new-invite-id");
    expect(body.invite.role).toBe("member");
    expect(body.emailSent).toBe(true);
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@acme.com",
        workspaceName: "Acme",
        inviterName: "Alice Founder",
      })
    );
  });

  it("refreshes (UPDATEs) an existing pending invite instead of inserting", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]); // no existing user
    mockSelectOnce([{ id: "t1", name: "Acme" }]);
    mockSelectOnce([{ email: "alice@acme.com" }]);
    mockSelectOnce([{ id: "old-invite", token: "old-token" }]); // existing pending invite

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invite.id).toBe("old-invite");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member" })
    );
  });

  it("returns emailError when sendInviteEmail fails but row was created", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    vi.mocked(sendInviteEmail).mockResolvedValue({
      sent: false,
      reason: "RESEND_API_KEY missing",
    });
    mockSelectOnce([]);
    mockSelectOnce([{ id: "t1", name: "Acme" }]);
    mockSelectOnce([{ email: "alice@acme.com" }]);
    mockSelectOnce([]);
    const returningFn = vi.fn().mockResolvedValue([{ id: "new-id" }]);
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningFn }) } as never);

    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe("RESEND_API_KEY missing");
  });
});
