/**
 * isOAuthSignInAllowed — the invitation-only OAuth gate. It is enforced only
 * when self-serve sign-up is disabled (production default); when enabled
 * (dev / restorable) it allows the login so OAuth first-login can
 * self-provision a tenant downstream. The prod-hidden flag and the DB are
 * mocked so the decision logic is exercised without a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let resultQueue: Array<Array<Record<string, unknown>>> = [];
const eqCalls: unknown[][] = [];
let selfServeEnabled = false; // default: production / invitation-only mode
const nextResult = () => resultQueue.shift() ?? [];

vi.mock("@/lib/auth/self-serve-signup", () => ({
  get SELF_SERVE_SIGNUP_ENABLED() {
    return selfServeEnabled;
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        // query 1 (authUsers): .where().limit()
        // query 2 (pendingInvites): .where().orderBy().limit()
        where: () => ({
          limit: async () => nextResult(),
          orderBy: () => ({ limit: async () => nextResult() }),
        }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  authUsers: { id: {}, email: {} },
  pendingInvites: { email: {}, status: {}, expiresAt: {}, createdAt: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => {
    eqCalls.push(a);
    return a;
  },
}));

import { isOAuthSignInAllowed } from "@/lib/auth/oauth-account-gate";

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 1_000);

describe("isOAuthSignInAllowed", () => {
  beforeEach(() => {
    resultQueue = [];
    eqCalls.length = 0;
    selfServeEnabled = false; // exercise the production invitation-only path
  });

  it("allows any sign-in when self-serve sign-up is enabled (dev), without touching the DB", async () => {
    selfServeEnabled = true;
    expect(await isOAuthSignInAllowed("stranger@acme.co")).toBe(true);
    expect(eqCalls).toHaveLength(0);
  });

  it("denies a blank / whitespace / null email without touching the DB", async () => {
    for (const e of ["", "   ", null, undefined]) {
      expect(await isOAuthSignInAllowed(e)).toBe(false);
    }
    expect(eqCalls).toHaveLength(0);
  });

  it("allows a returning user whose account already exists", async () => {
    resultQueue = [[{ id: "u1" }]]; // authUsers lookup hits
    expect(await isOAuthSignInAllowed("user@acme.co")).toBe(true);
  });

  it("short-circuits on an existing account without consulting invites", async () => {
    resultQueue = [[{ id: "u1" }]]; // only the authUsers result is queued
    expect(await isOAuthSignInAllowed("user@acme.co")).toBe(true);
    // returned before the invite query, so only the email eq ran
    expect(eqCalls).toHaveLength(1);
  });

  it("allows a net-new user who has a pending, unexpired invite", async () => {
    resultQueue = [
      [], // no existing account
      [{ status: "pending", expiresAt: future() }], // open invite
    ];
    expect(await isOAuthSignInAllowed("invited@acme.co")).toBe(true);
  });

  it("denies a net-new user whose invite is expired", async () => {
    resultQueue = [[], [{ status: "pending", expiresAt: past() }]];
    expect(await isOAuthSignInAllowed("late@acme.co")).toBe(false);
  });

  it("denies a stranger with no account and no invite (no self-provisioning)", async () => {
    resultQueue = [[], []];
    expect(await isOAuthSignInAllowed("stranger@acme.co")).toBe(false);
  });

  it("normalizes the email (lowercased + trimmed) before the lookup", async () => {
    resultQueue = [[{ id: "u1" }]];
    await isOAuthSignInAllowed("  USER@Acme.CO  ");
    // first eq call binds authUsers.email to the normalized address
    expect(eqCalls[0][1]).toBe("user@acme.co");
  });
});
