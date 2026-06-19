import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(() => null),
  // CLE-12 — the route now also calls the shared matrix guard. Stub it to
  // allow (null) so these tests stay focused on the invite/email behaviour;
  // the guard's own role-gating is covered in route-capability.test.ts.
  requireCapabilityForRequest: vi.fn(() => null),
}));

vi.mock("@/lib/auth/invite-token", () => ({
  generateInviteToken: vi.fn(() => ({ raw: "raw-token-abc", hash: "hashed-token-abc" })),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
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
    clerkId: "clerkId",
  },
  tenants: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/emails/email-invite", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { sendInviteEmail } from "@/lib/emails/email-invite";

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
    vi.mocked(requirePermission).mockReturnValue(null);
    vi.mocked(sendInviteEmail).mockResolvedValue({ sent: true });
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ ...authAdmin, role: "member" });
    vi.mocked(requirePermission).mockReturnValue(
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

  it("400 when target email is already an ACTIVE workspace member", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([{ id: "existing-user-id", clerkId: "auth-x", deactivatedAt: null }]); // active member
    const res = await mod.POST(makeReq({ email: "bob@acme.com" }));
    expect(res.status).toBe(400);
  });

  it("re-adds (reactivates) a previously-removed member instead of inviting", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([{ id: "u-old", clerkId: "auth-old", deactivatedAt: new Date() }]); // deactivated row

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await mod.POST(makeReq({ email: "bob@acme.com", role: "member" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reactivated).toBe(true);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ deactivatedAt: null, role: "member" }),
    );
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

  it("accepts role viewer and stores it on the invite", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]); // no existing user
    mockSelectOnce([{ id: "t1", name: "Acme" }]); // tenant
    mockSelectOnce([{ email: "alice@acme.com" }]); // inviter
    mockSelectOnce([]); // no existing pending invite

    const returningFn = vi.fn().mockResolvedValue([{ id: "viewer-invite-id" }]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(makeReq({ email: "advisor@fund.com", role: "viewer" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invite.role).toBe("viewer");
    expect(valuesFn).toHaveBeenCalledWith(expect.objectContaining({ role: "viewer" }));
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ role: "viewer" })
    );
  });

  it("coerces an unknown role to member, never to admin", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin);
    mockSelectOnce([]);
    mockSelectOnce([{ id: "t1", name: "Acme" }]);
    mockSelectOnce([{ email: "alice@acme.com" }]);
    mockSelectOnce([]);
    const returningFn = vi.fn().mockResolvedValue([{ id: "x" }]);
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningFn }) } as never);

    const res = await mod.POST(makeReq({ email: "bob@acme.com", role: "owner" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invite.role).toBe("member");
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
