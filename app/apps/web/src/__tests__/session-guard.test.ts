import { describe, it, expect, vi, beforeEach } from "vitest";

const selectChain = {
  from: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
};
selectChain.from.mockReturnValue(selectChain);
selectChain.leftJoin.mockReturnValue(selectChain);
selectChain.where.mockReturnValue(selectChain);

vi.mock("@/db", () => ({
  db: { select: vi.fn(() => selectChain) },
}));

vi.mock("@/db/schema", () => ({
  users: { clerkId: "clerk_id", deactivatedAt: "deactivated_at" },
  authUsers: { id: "id", passwordChangedAt: "password_changed_at" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import {
  getSessionGuard,
  invalidateSessionGuard,
  isTokenPredatingPasswordChange,
} from "@/lib/auth/session-guard";
import { db } from "@/db";

beforeEach(() => {
  vi.mocked(db.select).mockClear();
  selectChain.limit.mockReset();
});

describe("session-guard", () => {
  it("returns deactivation + password-change state from the DB", async () => {
    const deactivatedAt = new Date("2026-06-10T10:00:00Z");
    selectChain.limit.mockResolvedValueOnce([
      { deactivatedAt, passwordChangedAt: null },
    ]);
    const state = await getSessionGuard("auth-user-1");
    expect(state.deactivatedAt).toEqual(deactivatedAt);
    expect(state.passwordChangedAt).toBeNull();
  });

  it("caches per user for the TTL and busts on invalidate", async () => {
    selectChain.limit.mockResolvedValue([
      { deactivatedAt: null, passwordChangedAt: null },
    ]);
    await getSessionGuard("auth-user-2");
    await getSessionGuard("auth-user-2");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1); // second hit was cached

    invalidateSessionGuard("auth-user-2");
    await getSessionGuard("auth-user-2");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2); // refetched after bust
  });

  it("fails open when the lookup throws", async () => {
    selectChain.limit.mockRejectedValueOnce(new Error("db down"));
    const state = await getSessionGuard("auth-user-3");
    expect(state.deactivatedAt).toBeNull();
    expect(state.passwordChangedAt).toBeNull();
  });

  it("treats a missing row as active (fresh OAuth user pre-tenant)", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    const state = await getSessionGuard("auth-user-4");
    expect(state.deactivatedAt).toBeNull();
  });
});

describe("isTokenPredatingPasswordChange", () => {
  const changedAt = new Date("2026-06-10T12:00:00Z");

  it("rejects a token issued before the password change", () => {
    const issuedBefore = Math.floor(changedAt.getTime() / 1000) - 3600;
    expect(isTokenPredatingPasswordChange(issuedBefore, changedAt)).toBe(true);
  });

  it("accepts a token issued after the password change", () => {
    const issuedAfter = Math.floor(changedAt.getTime() / 1000) + 60;
    expect(isTokenPredatingPasswordChange(issuedAfter, changedAt)).toBe(false);
  });

  it("is a no-op when no password change is recorded or iat missing", () => {
    expect(isTokenPredatingPasswordChange(1234567890, null)).toBe(false);
    expect(isTokenPredatingPasswordChange(undefined, changedAt)).toBe(false);
  });
});
