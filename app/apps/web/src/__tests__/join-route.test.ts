/**
 * GET /join?code=… — the shared beta-access entry point. A valid code redirects
 * to /sign-up and drops the signed beta cookie; an invalid / missing code
 * redirects to the marketing page with no cookie. No DB, no next/headers.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/join/route";
import { BETA_ACCESS_COOKIE } from "@/lib/auth/beta-access";

const ORIGINAL = {
  code: process.env.BETA_SIGNUP_CODE,
  authSecret: process.env.AUTH_SECRET,
};

beforeEach(() => {
  process.env.BETA_SIGNUP_CODE = "beta-2026";
  process.env.AUTH_SECRET = "test-signing-secret";
});
afterEach(() => {
  process.env.BETA_SIGNUP_CODE = ORIGINAL.code;
  process.env.AUTH_SECRET = ORIGINAL.authSecret;
});

const call = (url: string) => GET(new NextRequest(new URL(url)));

describe("GET /join", () => {
  it("redirects a valid code to /sign-up and sets the beta cookie", async () => {
    const res = await call("https://www.elevay.dev/join?code=beta-2026");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.elevay.dev/sign-up");
    const cookie = res.cookies.get(BETA_ACCESS_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  it("redirects a wrong code to the marketing page with no cookie", async () => {
    const res = await call("https://www.elevay.dev/join?code=nope");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.elevay.dev/");
    expect(res.cookies.get(BETA_ACCESS_COOKIE)).toBeUndefined();
  });

  it("redirects a missing code to the marketing page with no cookie", async () => {
    const res = await call("https://www.elevay.dev/join");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.elevay.dev/");
    expect(res.cookies.get(BETA_ACCESS_COOKIE)).toBeUndefined();
  });

  it("refuses to grant access when no signing secret is configured", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const res = await call("https://www.elevay.dev/join?code=beta-2026");
    expect(res.headers.get("location")).toBe("https://www.elevay.dev/");
    expect(res.cookies.get(BETA_ACCESS_COOKIE)).toBeUndefined();
  });
});
