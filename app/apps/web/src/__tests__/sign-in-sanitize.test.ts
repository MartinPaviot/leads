import { describe, it, expect } from "vitest";
import {
  sanitizeCallbackUrl,
  SIGN_IN_ERROR_COPY,
  SIGN_IN_REASON_COPY,
  resolveSignInErrorCopy,
} from "@/lib/auth/auth-callback";

describe("sanitizeCallbackUrl", () => {
  it("defaults to /home when no callback is provided", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe("/home");
    expect(sanitizeCallbackUrl("")).toBe("/home");
  });

  it("accepts same-origin relative paths", () => {
    expect(sanitizeCallbackUrl("/accounts")).toBe("/accounts");
    expect(sanitizeCallbackUrl("/accept-invite?token=abc")).toBe(
      "/accept-invite?token=abc"
    );
  });

  it("rejects absolute URLs (open-redirect guard)", () => {
    expect(sanitizeCallbackUrl("https://evil.example/phish")).toBe("/home");
    expect(sanitizeCallbackUrl("http://localhost:3000/anywhere")).toBe("/home");
  });

  it("rejects scheme-relative URLs (//evil.example)", () => {
    expect(sanitizeCallbackUrl("//evil.example")).toBe("/home");
  });

  it("rejects non-slash-prefixed values", () => {
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/home");
    expect(sanitizeCallbackUrl("accounts")).toBe("/home");
  });
});

describe("SIGN_IN_ERROR_COPY + SIGN_IN_REASON_COPY", () => {
  it("covers the common NextAuth error types with human copy", () => {
    expect(SIGN_IN_ERROR_COPY.CredentialsSignin).toMatch(/incorrect/i);
    expect(SIGN_IN_ERROR_COPY.OAuthAccountNotLinked).toMatch(/another sign-in/i);
    expect(SIGN_IN_ERROR_COPY.OAuthCallback).toMatch(/try again/i);
    expect(SIGN_IN_ERROR_COPY.AccessDenied).toMatch(/invitation-only/i);
  });

  it("covers password-reset and session-expired reasons", () => {
    expect(SIGN_IN_REASON_COPY["password-reset-success"]).toMatch(/updated/i);
    expect(SIGN_IN_REASON_COPY["session-expired"]).toMatch(/timed out/i);
  });

  // I5: every NextAuth v5 ErrorType that can land in `?error=...` must
  // resolve to a non-empty, human sentence — never a raw token.
  const v5ErrorTypes = [
    "AccessDenied",
    "AdapterError",
    "CallbackRouteError",
    "CredentialsSignin",
    "JWTSessionError",
    "MissingAdapter",
    "MissingSecret",
    "OAuthAccountNotLinked",
    "OAuthCallbackError",
    "OAuthProfileParseError",
    "SessionTokenError",
    "OAuthSignInError",
    "EmailSignInError",
    "Verification",
    "MissingCSRF",
    "AccountNotLinked",
    "InvalidCallbackUrl",
    "InvalidCheck",
  ];

  it.each(v5ErrorTypes)("maps %s to a friendly sentence", (code) => {
    const copy = SIGN_IN_ERROR_COPY[code];
    expect(copy, `missing copy for ${code}`).toBeTruthy();
    // No raw camelCase tokens leaking through.
    expect(copy).not.toMatch(/[A-Z][a-z]+[A-Z]/);
    // Sentence-shaped: starts uppercase, ends with `.`.
    expect(copy).toMatch(/^[A-Z].*[.!?]$/);
  });

  it("never reveals whether email or password specifically was wrong", () => {
    // Safe pattern: "Email or password is incorrect." mentions both, so an
    // attacker can't tell which one they got wrong (no email enumeration).
    // Unsafe patterns single one out — e.g. "Wrong password." or
    // "No account with that email."
    const copy = SIGN_IN_ERROR_COPY.CredentialsSignin;
    expect(copy).toMatch(/email/i);
    expect(copy).toMatch(/password/i);
    expect(copy).not.toMatch(/wrong password\b/i);
    expect(copy).not.toMatch(/no (such )?(user|account)\b/i);
    expect(copy).not.toMatch(/account (does not|doesn't) exist/i);
    expect(copy).not.toMatch(/email (is )?(not found|unknown|unregistered)\b/i);
  });

  it("covers the legacy v4 OAuth aliases that may still appear in URLs", () => {
    expect(SIGN_IN_ERROR_COPY.OAuthSignin).toBeTruthy();
    expect(SIGN_IN_ERROR_COPY.OAuthCallback).toBeTruthy();
    expect(SIGN_IN_ERROR_COPY.OAuthCreateAccount).toBeTruthy();
    expect(SIGN_IN_ERROR_COPY.Configuration).toBeTruthy();
  });
});

describe("resolveSignInErrorCopy", () => {
  it("returns null when no error code is present", () => {
    expect(resolveSignInErrorCopy(undefined)).toBeNull();
    expect(resolveSignInErrorCopy("")).toBeNull();
  });

  it("returns the friendly copy for known codes", () => {
    expect(resolveSignInErrorCopy("CredentialsSignin")).toMatch(/incorrect/i);
    expect(resolveSignInErrorCopy("AccessDenied")).toMatch(/invitation-only/i);
  });

  it("falls back to the Default copy for unknown / future codes", () => {
    const fallback = resolveSignInErrorCopy("SomeBrandNewErrorTypeFromAuthJs");
    expect(fallback).toBe(SIGN_IN_ERROR_COPY.Default);
    expect(fallback).toMatch(/try again/i);
  });

  it("never returns a raw camelCase token for unknown codes", () => {
    const fallback = resolveSignInErrorCopy("CallbackRouteError");
    expect(fallback).not.toContain("CallbackRouteError");
  });
});
