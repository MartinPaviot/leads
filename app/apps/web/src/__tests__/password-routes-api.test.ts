import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  authUsers: { id: "id", email: "email" },
  authAccounts: {
    userId: "userId",
    provider: "provider",
    type: "type",
    providerAccountId: "providerAccountId",
    access_token: "access_token",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({
  createResetTokenForUser: vi.fn().mockResolvedValue("plain-token-123"),
  validateResetToken: vi.fn(),
  consumeResetToken: vi.fn().mockResolvedValue(undefined),
  isPasswordAcceptable: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/emails/password-reset", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock("@/lib/emails/password-changed", () => ({
  sendPasswordChangedEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitPasswordResetEmail: vi.fn().mockReturnValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 }),
  rateLimitPasswordResetIp: vi.fn().mockReturnValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 }),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-pw"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import {
  createResetTokenForUser,
  validateResetToken,
  consumeResetToken,
  isPasswordAcceptable,
} from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/emails/password-reset";
import { sendPasswordChangedEmail } from "@/lib/emails/password-changed";
import {
  rateLimitPasswordResetEmail,
  rateLimitPasswordResetIp,
} from "@/lib/rate-limit";
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
    vi.mocked(rateLimitPasswordResetEmail).mockReturnValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 });
    vi.mocked(rateLimitPasswordResetIp).mockReturnValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 });
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
    vi.mocked(rateLimitPasswordResetEmail).mockReturnValue({
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

  it("happy path: updates existing credentials hash + consumes token + sends notification", async () => {
    vi.mocked(validateResetToken).mockResolvedValue({
      id: "tok-id",
      userId: "u-1",
    } as never);
    mockSelectOnce([{ provider: "credentials" }]); // existing creds row
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
    mockSelectOnce([{ email: "bob@acme.com" }]); // user lookup for notification

    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith({ access_token: "hashed-pw" });
    expect(consumeResetToken).toHaveBeenCalledWith("tok-id");
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith("bob@acme.com", null);
  });

  it("happy path: inserts a new credentials account when none exists (OAuth-only user)", async () => {
    vi.mocked(validateResetToken).mockResolvedValue({
      id: "tok-id",
      userId: "u-1",
    } as never);
    mockSelectOnce([]); // no creds row
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);
    mockSelectOnce([]); // no user email — notification skipped

    const res = await resetMod.POST(
      jsonReq("http://localhost/api/auth/reset-password", {
        token: "valid-token-123",
        password: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(200);
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        provider: "credentials",
        access_token: "hashed-pw",
      })
    );
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
    mockSelectOnce([]); // no credentials account
    const res = await changeMod.POST(
      jsonReq("http://localhost/api/account/password", {
        currentPassword: "old",
        newPassword: "StrongPass1ABC",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/SSO/i);
  });

  it("400 when current password doesn't match", async () => {
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

  it("happy path: writes new hash and returns 200", async () => {
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
    expect(setFn).toHaveBeenCalledWith({ access_token: "hashed-pw" });
  });
});
