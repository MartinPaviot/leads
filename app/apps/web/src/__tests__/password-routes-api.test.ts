import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
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
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  authUsers: { id: "id", email: "email", passwordHash: "password_hash", name: "name" },
  authAccounts: {
    userId: "userId",
    provider: "provider",
    type: "type",
    providerAccountId: "providerAccountId",
    access_token: "access_token",
  },
  users: {
    id: "id",
    tenantId: "tenantId",
    clerkId: "clerkId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/auth/password-reset", () => ({
  createResetTokenForUser: vi.fn().mockResolvedValue("plain-token-123"),
  validateResetToken: vi.fn(),
  consumeResetToken: vi.fn().mockResolvedValue(undefined),
  isPasswordAcceptable: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/auth/password-hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-pw"),
}));

vi.mock("@/lib/auth/password-pwned", () => ({
  isPasswordPwned: vi.fn().mockResolvedValue({ pwned: false }),
}));

vi.mock("@/lib/emails/password-reset", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock("@/lib/emails/password-changed", () => ({
  sendPasswordChangedEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimitPasswordResetEmail: vi.fn().mockResolvedValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 }),
  rateLimitPasswordResetIp: vi.fn().mockResolvedValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-pw"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  createResetTokenForUser,
  validateResetToken,
  consumeResetToken,
  isPasswordAcceptable,
} from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/emails/password-reset";
import { sendPasswordChangedEmail } from "@/lib/emails/password-changed";
import {
  rateLimitPasswordResetEmail,
  rateLimitPasswordResetIp,
} from "@/lib/infra/rate-limit";
import bcrypt from "bcryptjs";

const forgotMod = await import("@/app/api/auth/forgot-password/route");
const resetMod = await import("@/app/api/auth/reset-password/route");
const changeMod = await import("@/app/api/account/password/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "member" as const,
};

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function jsonReq(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ============================================================
// POST /api/auth/forgot-password
// ============================================================

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitPasswordResetEmail).mockResolvedValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 });
    vi.mocked(rateLimitPasswordResetIp).mockResolvedValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 });
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ sent: true });
    vi.mocked(createResetTokenForUser).mockResolvedValue("plain-token-123");
  });

  it("always returns 200 {ok:true}, even on missing email", async () => {
    const res = await forgotMod.POST(
      jsonReq("http://localhost/api/auth/forgot-password", {})
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 {ok:true} on rate-limited request without sending email", async () => {
    vi.mocked(rateLimitPasswordResetEmail).mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const res = await forgotMod.POST(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "bob@acme.com" })
    );
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns 200 {ok:true} on unknown email without leaking", async () => {
    mockSelectOnce([]); // no user found
    const res = await forgotMod.POST(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "ghost@x.com" })
    );
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("issues token + sends email when user exists", async () => {
    mockSelectOnce([{ id: "u-1", email: "bob@acme.com" }]);
    const res = await forgotMod.POST(
      jsonReq(
        "http://localhost/api/auth/forgot-password",
        { email: "bob@acme.com" },
        { "x-forwarded-for": "1.2.3.4", "user-agent": "test-ua" }
      )
    );
    expect(res.status).toBe(200);
    expect(createResetTokenForUser).toHaveBeenCalledWith("u-1", "1.2.3.4", "test-ua");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("bob@acme.com", "plain-token-123");
  });

  it("still returns 200 when email send fails (logged + swallowed)", async () => {
    mockSelectOnce([{ id: "u-1", email: "bob@acme.com" }]);
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ sent: false, reason: "smtp-down" });
    const res = await forgotMod.POST(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "bob@acme.com" })
    );
    expect(res.status).toBe(200);
  });
});

// ============================================================
// POST /api/auth/reset-password
// ============================================================

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPasswordAcceptable).mockReturnValue(true);
    vi.mocked(consumeResetToken).mockResolvedValue(undefined);
    vi.mocked(sendPasswordChangedEmail).mockResolvedValue({ sent: true });
  });

  it("400 when payload fails validation", async () => {
    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", { token: "x" }) // password missing
    );
    expect(res.status).toBe(400);
  });

  it("400 when password fails strength check", async () => {
    vi.mocked(isPasswordAcceptable).mockReturnValue(false);
    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "weakweakweak",
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 with generic message when token is invalid/expired", async () => {
    vi.mocked(validateResetToken).mockResolvedValue(null);
    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  it("happy path: writes passwordHash on authUsers, clears legacy access_token, consumes token, sends notification (H12)", async () => {
    vi.mocked(validateResetToken).mockResolvedValue({
      id: "tok-id",
      userId: "u-1",
    } as never);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
    mockSelectOnce([{ provider: "credentials" }]); // existing creds row
    // Audit-log path does a dynamic db.select(users) — supply an empty result
    // so the audit is silently skipped. This runs BEFORE the notification lookup.
    mockSelectOnce([]);
    mockSelectOnce([{ email: "bob@acme.com" }]); // user lookup for notification

    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    // Two update calls: (1) authUsers.passwordHash = new hash,
    // (2) authAccounts.access_token = null (legacy column cleared).
    expect(setFn).toHaveBeenNthCalledWith(1, { passwordHash: "hashed-pw", passwordChangedAt: expect.any(Date) });
    expect(setFn).toHaveBeenNthCalledWith(2, { access_token: null });
    expect(consumeResetToken).toHaveBeenCalledWith("tok-id");
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith("bob@acme.com", null);
  });

  it("happy path: inserts a NEW empty credentials account when none exists (OAuth-only user) (H12)", async () => {
    vi.mocked(validateResetToken).mockResolvedValue({
      id: "tok-id",
      userId: "u-1",
    } as never);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
    mockSelectOnce([]); // no creds row
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);
    mockSelectOnce([]); // no user email — notification skipped
    // Audit-log path
    mockSelectOnce([]);

    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith({ passwordHash: "hashed-pw", passwordChangedAt: expect.any(Date) });
    // The new credentials row must NOT carry a hash — the hash lives
    // on authUsers now.
    const insertedRow = valuesFn.mock.calls[0]?.[0];
    expect(insertedRow).toMatchObject({
      userId: "u-1",
      provider: "credentials",
    });
    expect(insertedRow).not.toHaveProperty("access_token");
  });
});

// ============================================================
// POST /api/account/password
// ============================================================

describe("POST /api/account/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPasswordAcceptable).mockReturnValue(true);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  });

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "x",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(401);
  });

  it("400 on validation failure", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", { newPassword: "x" })
    );
    expect(res.status).toBe(400);
  });

  it("400 when new password fails strength check", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    vi.mocked(isPasswordAcceptable).mockReturnValue(false);
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "old",
        newPassword: "weakweakweak",
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 + SSO message when no credentials row exists", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([{ id: "u-1", hash: null }]); // authUsers row, no hash
    mockSelectOnce([]); // legacy authAccounts lookup — no creds row either
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "old",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/SSO/i);
  });

  it("400 when current password doesn't match (reads from authUsers.passwordHash)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([{ id: "u-1", hash: "stored-hash" }]);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "wrong",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/incorrect/i);
  });

  it("happy path (H12): writes passwordHash on authUsers, clears legacy access_token", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([{ id: "u-1", hash: "stored-hash" }]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "old",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenNthCalledWith(1, { passwordHash: "hashed-pw", passwordChangedAt: expect.any(Date) });
    expect(setFn).toHaveBeenNthCalledWith(2, { access_token: null });
  });

  it("backcompat: reads from legacy authAccounts.access_token when authUsers.passwordHash is null (H12 fallback)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectOnce([{ id: "u-1", hash: null }]); // not migrated yet
    mockSelectOnce([{ hash: "legacy-hash" }]);   // legacy column has it
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "old",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    // New hash goes in the canonical place; legacy column cleared.
    expect(setFn).toHaveBeenNthCalledWith(1, { passwordHash: "hashed-pw", passwordChangedAt: expect.any(Date) });
    expect(setFn).toHaveBeenNthCalledWith(2, { access_token: null });
  });
});
