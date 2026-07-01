import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeS256Challenge } from "../pkce";

const insertedValues: any[] = [];
const selectQueue: any[][] = [];
const updateReturningQueue: any[][] = [];
const updateCalls: any[] = [];

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
      set: (v: any) => ({
        where: () => ({
          returning: () => {
            updateCalls.push(v);
            return Promise.resolve(updateReturningQueue.shift() ?? []);
          },
        }),
      }),
    }),
  },
}));

import { issueAuthorizationCode, consumeAuthorizationCode } from "../authorization-codes";

beforeEach(() => {
  insertedValues.length = 0;
  selectQueue.length = 0;
  updateReturningQueue.length = 0;
  updateCalls.length = 0;
});

const baseInput = {
  clientId: "c1",
  tenantId: "t1",
  authUserId: "au1",
  appUserId: "apu1",
  role: "member",
  redirectUri: "https://claude.ai/callback",
  codeChallenge: computeS256Challenge("verifier-abc"),
  codeChallengeMethod: "S256",
  scope: "read write",
};

describe("issueAuthorizationCode", () => {
  it("persists the full resolved principal + PKCE challenge", async () => {
    const code = await issueAuthorizationCode(baseInput);
    expect(code).toBeTruthy();
    expect(insertedValues[0]).toMatchObject({
      code,
      clientId: "c1",
      tenantId: "t1",
      authUserId: "au1",
      appUserId: "apu1",
      role: "member",
      redirectUri: baseInput.redirectUri,
      codeChallenge: baseInput.codeChallenge,
    });
    expect(insertedValues[0].expiresAt).toBeInstanceOf(Date);
  });
});

describe("consumeAuthorizationCode", () => {
  const storedRow = {
    code: "code-1",
    clientId: "c1",
    tenantId: "t1",
    authUserId: "au1",
    appUserId: "apu1",
    role: "member",
    redirectUri: "https://claude.ai/callback",
    codeChallenge: computeS256Challenge("verifier-abc"),
    codeChallengeMethod: "S256",
    scope: "read write",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  };

  it("succeeds when client, redirect_uri, and PKCE verifier all match", async () => {
    selectQueue.push([storedRow]);
    updateReturningQueue.push([{ code: "code-1" }]);

    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "c1",
      redirectUri: "https://claude.ai/callback",
      codeVerifier: "verifier-abc",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("t1");
      expect(result.appUserId).toBe("apu1");
      expect(result.role).toBe("member");
    }
  });

  it("fails when the code doesn't exist", async () => {
    selectQueue.push([]);
    const result = await consumeAuthorizationCode({
      code: "nope",
      clientId: "c1",
      redirectUri: "https://claude.ai/callback",
      codeVerifier: "verifier-abc",
    });
    expect(result.ok).toBe(false);
  });

  it("fails when expired", async () => {
    selectQueue.push([{ ...storedRow, expiresAt: new Date(Date.now() - 1000) }]);
    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "c1",
      redirectUri: storedRow.redirectUri,
      codeVerifier: "verifier-abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("expired");
  });

  it("fails on client mismatch", async () => {
    selectQueue.push([storedRow]);
    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "different-client",
      redirectUri: storedRow.redirectUri,
      codeVerifier: "verifier-abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("client");
  });

  it("fails on redirect_uri mismatch", async () => {
    selectQueue.push([storedRow]);
    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "c1",
      redirectUri: "https://evil.com/callback",
      codeVerifier: "verifier-abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("redirect_uri");
  });

  it("fails when the PKCE verifier is wrong", async () => {
    selectQueue.push([storedRow]);
    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "c1",
      redirectUri: storedRow.redirectUri,
      codeVerifier: "wrong-verifier",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("PKCE");
  });

  it("fails on a racing double-consume (the atomic UPDATE affects 0 rows)", async () => {
    selectQueue.push([storedRow]);
    updateReturningQueue.push([]); // simulates: another request already consumed it first
    const result = await consumeAuthorizationCode({
      code: "code-1",
      clientId: "c1",
      redirectUri: storedRow.redirectUri,
      codeVerifier: "verifier-abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("race");
  });
});
