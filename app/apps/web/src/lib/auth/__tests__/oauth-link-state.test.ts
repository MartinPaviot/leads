import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signLinkState, verifyLinkState, LINK_STATE_TTL_MS } from "@/lib/auth/oauth-link-state";

const SECRET = "test-auth-secret-aaaaaaaaaaaaaaaaaaaaaaaa";

describe("oauth-link-state", () => {
  const prev = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  });

  it("round-trips a fresh token", () => {
    const now = 1_000_000;
    const { token, nonce } = signLinkState({ authUserId: "u1", tenantId: "t1", provider: "gmail" }, { now });
    const v = verifyLinkState(token, now + 1000);
    expect(v).not.toBeNull();
    expect(v!.authUserId).toBe("u1");
    expect(v!.tenantId).toBe("t1");
    expect(v!.provider).toBe("gmail");
    expect(v!.nonce).toBe(nonce);
  });

  it("rejects a tampered payload", () => {
    const { token } = signLinkState({ authUserId: "u1", tenantId: "t1", provider: "gmail" });
    const [b64, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ authUserId: "attacker", tenantId: "t1", provider: "gmail", nonce: "x", exp: Date.now() + 10000 })).toString("base64url");
    expect(verifyLinkState(`${forged}.${sig}`)).toBeNull();
    // also a flipped signature
    expect(verifyLinkState(`${b64}.${"0".repeat(sig.length)}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const { token } = signLinkState({ authUserId: "u1", tenantId: "t1", provider: "outlook" }, { now });
    expect(verifyLinkState(token, now + LINK_STATE_TTL_MS + 1)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const now = 1_000_000;
    const { token } = signLinkState({ authUserId: "u1", tenantId: "t1", provider: "gmail" }, { now });
    process.env.AUTH_SECRET = "a-completely-different-secret-value-bbbb";
    expect(verifyLinkState(token, now + 1000)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyLinkState("")).toBeNull();
    expect(verifyLinkState(null)).toBeNull();
    expect(verifyLinkState("nodot")).toBeNull();
    expect(verifyLinkState(".onlysig")).toBeNull();
  });

  it("refuses to sign without a secret", () => {
    delete process.env.AUTH_SECRET;
    const prevNa = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signLinkState({ authUserId: "u1", tenantId: "t1", provider: "gmail" })).toThrow();
    if (prevNa !== undefined) process.env.NEXTAUTH_SECRET = prevNa;
  });

  it("honors a caller-supplied nonce (so the route can bind it to a cookie)", () => {
    const { token } = signLinkState({ authUserId: "u1", tenantId: "t1", provider: "gmail", nonce: "fixed-nonce" });
    expect(verifyLinkState(token)!.nonce).toBe("fixed-nonce");
  });
});
