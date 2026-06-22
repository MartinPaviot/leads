import { describe, it, expect, beforeEach } from "vitest";
import { buildUnsubscribeUrl } from "../services/unsubscribe.js";
import { verifyUnsubscribeToken } from "@web/lib/emails/unsubscribe-token";

/**
 * P0-7 T5 — cross-runtime: a URL the WORKER builds (via the re-exported web
 * builder through the `@web/*` alias) must verify with the WEB route helper.
 * Proves Fix 3 resolves and the token is shared, not duplicated/divergent.
 */

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret";
});

function parts(url: string) {
  const u = new URL(url);
  return {
    tenant: u.searchParams.get("tenant") as string,
    email: u.searchParams.get("email") as string,
    token: u.searchParams.get("token") as string,
  };
}

describe("unsubscribe token — worker builds, web verifies", () => {
  it("round-trips a plain address", () => {
    const { tenant, email, token } = parts(buildUnsubscribeUrl("https://app.test", "t1", "bob@acme.com"));
    expect(verifyUnsubscribeToken(tenant, email, token)).toBe(true);
  });

  it("round-trips a + tag / mixed-case local part (lowercased deterministically)", () => {
    const { tenant, email, token } = parts(buildUnsubscribeUrl("https://app.test", "t1", "Bob+tag@Acme.com"));
    expect(verifyUnsubscribeToken(tenant, email, token)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const { tenant, email } = parts(buildUnsubscribeUrl("https://app.test", "t1", "bob@acme.com"));
    expect(verifyUnsubscribeToken(tenant, email, "deadbeef")).toBe(false);
  });
});
