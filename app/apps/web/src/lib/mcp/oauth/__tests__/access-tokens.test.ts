import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedValues: any[] = [];
const selectQueue: any[][] = [];
const updateReturningQueue: any[][] = [];

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (v: any) => {
        insertedValues.push(v);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectQueue.shift() ?? []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(updateReturningQueue.shift() ?? []),
        }),
      }),
    }),
  },
}));

import { issueTokens, verifyAccessToken, refreshTokens, type TokenPrincipal } from "../access-tokens";
import { hashToken } from "../tokens";

beforeEach(() => {
  insertedValues.length = 0;
  selectQueue.length = 0;
  updateReturningQueue.length = 0;
});

const principal: TokenPrincipal = {
  clientId: "c1",
  tenantId: "t1",
  authUserId: "au1",
  appUserId: "apu1",
  role: "member",
  scope: "read write",
};

describe("issueTokens", () => {
  it("issues a distinct access + refresh token pair, stored HASHED", async () => {
    const result = await issueTokens(principal);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).not.toBe(result.refreshToken);
    expect(insertedValues[0].accessTokenHash).toBe(hashToken(result.accessToken));
    expect(insertedValues[0].refreshTokenHash).toBe(hashToken(result.refreshToken));
    expect(result.expiresInSeconds).toBeGreaterThan(0);
  });
});

describe("verifyAccessToken", () => {
  it("returns ok:true for a valid, unexpired, unrevoked token", async () => {
    selectQueue.push([
      {
        accessTokenHash: "irrelevant-in-mock",
        clientId: "c1",
        tenantId: "t1",
        authUserId: "au1",
        appUserId: "apu1",
        role: "member",
        scope: "read write",
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      },
    ]);
    const result = await verifyAccessToken("some-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("t1");
      expect(result.appUserId).toBe("apu1");
    }
  });

  it("fails closed for an unknown token", async () => {
    selectQueue.push([]);
    expect((await verifyAccessToken("nope")).ok).toBe(false);
  });

  it("fails closed for an expired token", async () => {
    selectQueue.push([
      {
        clientId: "c1",
        tenantId: "t1",
        authUserId: "au1",
        appUserId: "apu1",
        role: "member",
        scope: "",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      },
    ]);
    expect((await verifyAccessToken("expired-token")).ok).toBe(false);
  });

  it("fails closed for an empty token string", async () => {
    expect((await verifyAccessToken("")).ok).toBe(false);
  });
});

describe("refreshTokens", () => {
  const storedRow = {
    accessTokenHash: "old-access-hash",
    refreshTokenHash: "irrelevant-in-mock",
    clientId: "c1",
    tenantId: "t1",
    authUserId: "au1",
    appUserId: "apu1",
    role: "member",
    scope: "read write",
    refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };

  it("rotates: revokes the old pair and issues a brand new one", async () => {
    selectQueue.push([storedRow]);
    updateReturningQueue.push([{ accessTokenHash: "old-access-hash" }]); // revoke succeeds

    const result = await refreshTokens("old-refresh-token", "c1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens.accessToken).toBeTruthy();
      expect(result.tokens.refreshToken).toBeTruthy();
    }
    // The new pair was inserted via issueTokens' own db.insert call.
    expect(insertedValues).toHaveLength(1);
  });

  it("fails on client mismatch", async () => {
    selectQueue.push([storedRow]);
    const result = await refreshTokens("old-refresh-token", "different-client");
    expect(result.ok).toBe(false);
  });

  it("fails when the refresh token is expired", async () => {
    selectQueue.push([{ ...storedRow, refreshTokenExpiresAt: new Date(Date.now() - 1000) }]);
    const result = await refreshTokens("old-refresh-token", "c1");
    expect(result.ok).toBe(false);
  });

  it("fails on a racing double-refresh (the atomic revoke UPDATE affects 0 rows)", async () => {
    selectQueue.push([storedRow]);
    updateReturningQueue.push([]); // another request already rotated it first
    const result = await refreshTokens("old-refresh-token", "c1");
    expect(result.ok).toBe(false);
    expect(insertedValues).toHaveLength(0); // never got to issuing a new pair
  });

  it("fails for an unknown/revoked refresh token", async () => {
    selectQueue.push([]);
    const result = await refreshTokens("nope", "c1");
    expect(result.ok).toBe(false);
  });
});
