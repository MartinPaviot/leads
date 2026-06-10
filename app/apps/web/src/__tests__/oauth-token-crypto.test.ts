import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptOAuthToken,
  decryptOAuthToken,
  decryptAccountTokens,
} from "@/lib/crypto/oauth-token-crypto";

beforeAll(() => {
  process.env.ELEVAY_APP_SECRET = "test-secret-for-oauth-token-crypto";
});

describe("oauth-token-crypto", () => {
  it("roundtrips a token through encrypt/decrypt", () => {
    const token = "ya29.a0AfH6SMBexampleaccesstoken-1234567890";
    const stored = encryptOAuthToken(token);
    expect(stored).not.toBeNull();
    expect(stored).not.toBe(token);
    expect(stored!.startsWith("v1.")).toBe(true);
    expect(decryptOAuthToken(stored)).toBe(token);
  });

  it("returns legacy plaintext values unchanged on decrypt", () => {
    // Pre-encryption rows: raw Google/MS tokens and JWT id_tokens.
    expect(decryptOAuthToken("ya29.plain-access-token")).toBe(
      "ya29.plain-access-token",
    );
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jIn0.sig";
    expect(decryptOAuthToken(jwt)).toBe(jwt);
    // H12 legacy: bcrypt hash stored in access_token for credentials rows.
    const bcryptHash =
      "$2a$12$CwTycUXWue0Thq9StjUM0uJ8SeaO5C7PBIW.VtTJPNjHRIKsY7tqW";
    expect(decryptOAuthToken(bcryptHash)).toBe(bcryptHash);
  });

  it("handles null/undefined/empty without throwing", () => {
    expect(encryptOAuthToken(null)).toBeNull();
    expect(encryptOAuthToken(undefined)).toBeNull();
    expect(encryptOAuthToken("")).toBeNull();
    expect(decryptOAuthToken(null)).toBeNull();
    expect(decryptOAuthToken(undefined)).toBeNull();
    expect(decryptOAuthToken("")).toBeNull();
  });

  it("never double-encrypts an already-encrypted value", () => {
    const once = encryptOAuthToken("refresh-token-value")!;
    const twice = encryptOAuthToken(once);
    expect(twice).toBe(once);
    expect(decryptOAuthToken(twice)).toBe("refresh-token-value");
  });

  it("throws on a tampered ciphertext instead of returning garbage", () => {
    const stored = encryptOAuthToken("sensitive")!;
    const parts = stored.split(".");
    // Flip the ciphertext segment.
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + "AA", parts[3]].join(".");
    expect(() => decryptOAuthToken(tampered)).toThrow();
  });

  it("decryptAccountTokens maps all three token columns", () => {
    const account = {
      provider: "google",
      access_token: encryptOAuthToken("access-1"),
      refresh_token: encryptOAuthToken("refresh-1"),
      id_token: "eyJlegacy.eyJwbGFpbg.sig",
    };
    const out = decryptAccountTokens(account);
    expect(out.access_token).toBe("access-1");
    expect(out.refresh_token).toBe("refresh-1");
    expect(out.id_token).toBe("eyJlegacy.eyJwbGFpbg.sig");
    expect(out.provider).toBe("google");
  });
});
