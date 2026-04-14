import { describe, it, expect } from "vitest";
import {
  sanitizeCallbackUrl,
  SIGN_IN_ERROR_COPY,
  SIGN_IN_REASON_COPY,
} from "@/lib/auth-callback";

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
    expect(SIGN_IN_ERROR_COPY.AccessDenied).toMatch(/do not have access/i);
  });

  it("covers password-reset and session-expired reasons", () => {
    expect(SIGN_IN_REASON_COPY["password-reset-success"]).toMatch(/updated/i);
    expect(SIGN_IN_REASON_COPY["session-expired"]).toMatch(/timed out/i);
  });
});
