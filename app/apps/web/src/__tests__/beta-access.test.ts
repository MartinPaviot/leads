/**
 * beta-access — the shared-link signup gate. `verifyBetaCode` compares a
 * presented code to BETA_SIGNUP_CODE (constant-time); the cookie helpers mint
 * and verify a short-lived HMAC-signed grant. All pure (no DB, no next/headers
 * — `hasBetaAccess` is the thin wrapper that reads the cookie store), so we
 * exercise the security logic directly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyBetaCode,
  isBetaSignupConfigured,
  mintBetaAccessCookie,
  isBetaAccessCookieValid,
} from "@/lib/auth/beta-access";

const ORIGINAL = {
  code: process.env.BETA_SIGNUP_CODE,
  authSecret: process.env.AUTH_SECRET,
  nextauthSecret: process.env.NEXTAUTH_SECRET,
};

beforeEach(() => {
  process.env.BETA_SIGNUP_CODE = "super-secret-beta-2026";
  process.env.AUTH_SECRET = "test-signing-secret";
  delete process.env.NEXTAUTH_SECRET;
});

afterEach(() => {
  process.env.BETA_SIGNUP_CODE = ORIGINAL.code;
  process.env.AUTH_SECRET = ORIGINAL.authSecret;
  process.env.NEXTAUTH_SECRET = ORIGINAL.nextauthSecret;
});

describe("verifyBetaCode", () => {
  it("accepts the exact configured code", () => {
    expect(verifyBetaCode("super-secret-beta-2026")).toBe(true);
  });

  it("trims surrounding whitespace before comparing", () => {
    expect(verifyBetaCode("  super-secret-beta-2026  ")).toBe(true);
  });

  it("rejects a wrong code of the same length", () => {
    expect(verifyBetaCode("super-secret-beta-2025")).toBe(false);
  });

  it("rejects a wrong code of a different length", () => {
    expect(verifyBetaCode("nope")).toBe(false);
  });

  it("rejects null / empty", () => {
    expect(verifyBetaCode(null)).toBe(false);
    expect(verifyBetaCode("")).toBe(false);
  });

  it("is off (always false) when no code is configured", () => {
    delete process.env.BETA_SIGNUP_CODE;
    expect(isBetaSignupConfigured()).toBe(false);
    expect(verifyBetaCode("anything")).toBe(false);
  });
});

describe("beta-access cookie", () => {
  it("round-trips: a freshly minted cookie verifies", () => {
    const value = mintBetaAccessCookie();
    expect(value).not.toBeNull();
    expect(isBetaAccessCookieValid(value)).toBe(true);
  });

  it("rejects an expired cookie", () => {
    // Mint with a clock 31 minutes in the past (TTL is 30 min).
    const value = mintBetaAccessCookie(Date.now() - 31 * 60 * 1000);
    expect(isBetaAccessCookieValid(value)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const value = mintBetaAccessCookie()!;
    const [exp] = value.split(".");
    expect(isBetaAccessCookieValid(`${exp}.deadbeef`)).toBe(false);
  });

  it("rejects a cookie minted under a different secret", () => {
    const value = mintBetaAccessCookie()!;
    process.env.AUTH_SECRET = "a-different-secret";
    expect(isBetaAccessCookieValid(value)).toBe(false);
  });

  it("rejects malformed values", () => {
    for (const bad of ["", "no-dot", ".", "abc.def", "999"]) {
      expect(isBetaAccessCookieValid(bad)).toBe(false);
    }
  });

  it("refuses to mint (and never validates) without a signing secret", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(mintBetaAccessCookie()).toBeNull();
    expect(isBetaAccessCookieValid("123.abc")).toBe(false);
  });
});
