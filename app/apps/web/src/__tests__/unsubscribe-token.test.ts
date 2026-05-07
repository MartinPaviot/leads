import { describe, it, expect, beforeEach } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/lib/emails/unsubscribe-token";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-prod";
});

describe("generateUnsubscribeToken", () => {
  it("is deterministic for the same (tenant, email) pair", () => {
    const a = generateUnsubscribeToken("t1", "bob@acme.com");
    const b = generateUnsubscribeToken("t1", "bob@acme.com");
    expect(a).toBe(b);
  });

  it("normalises email casing — token is the same regardless of input case", () => {
    expect(generateUnsubscribeToken("t1", "BOB@ACME.COM")).toBe(
      generateUnsubscribeToken("t1", "bob@acme.com"),
    );
  });

  it("differs across tenants for the same email", () => {
    const a = generateUnsubscribeToken("t1", "bob@acme.com");
    const b = generateUnsubscribeToken("t2", "bob@acme.com");
    expect(a).not.toBe(b);
  });

  it("differs across emails for the same tenant", () => {
    const a = generateUnsubscribeToken("t1", "bob@acme.com");
    const b = generateUnsubscribeToken("t1", "alice@acme.com");
    expect(a).not.toBe(b);
  });

  it("throws if AUTH_SECRET is missing", () => {
    delete process.env.AUTH_SECRET;
    expect(() => generateUnsubscribeToken("t1", "bob@acme.com")).toThrow(
      /AUTH_SECRET/,
    );
  });
});

describe("verifyUnsubscribeToken", () => {
  it("accepts a freshly-generated token", () => {
    const token = generateUnsubscribeToken("t1", "bob@acme.com");
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", token)).toBe(true);
  });

  it("rejects a token that decodes to a different byte length", () => {
    // Truncate the hex string by 2 chars (one byte) to guarantee a length mismatch
    const token = generateUnsubscribeToken("t1", "bob@acme.com");
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", token.slice(0, -2))).toBe(false);
  });

  it("rejects a tampered token (same length, different bytes)", () => {
    const token = generateUnsubscribeToken("t1", "bob@acme.com");
    // Flip the leading hex digit — guaranteed to change at least one byte
    const swap: Record<string, string> = { "0": "1", "1": "0", "a": "b", "b": "a" };
    const flipped = (swap[token[0]] ?? "f") + token.slice(1);
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", flipped)).toBe(false);
  });

  it("rejects a token from a different tenant", () => {
    const token = generateUnsubscribeToken("t2", "bob@acme.com");
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", token)).toBe(false);
  });

  it("rejects a token for a different email", () => {
    const token = generateUnsubscribeToken("t1", "alice@acme.com");
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", token)).toBe(false);
  });

  it("returns false (not throws) on garbage input", () => {
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", "not-a-hex!@#$")).toBe(false);
  });
});

describe("buildUnsubscribeUrl", () => {
  it("includes encoded email + tenant + token", () => {
    const url = buildUnsubscribeUrl("https://app.example.com", "t1", "bob+filter@acme.com");
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/unsubscribe");
    expect(parsed.searchParams.get("email")).toBe("bob+filter@acme.com");
    expect(parsed.searchParams.get("tenant")).toBe("t1");
    expect(parsed.searchParams.get("token")).toBeTruthy();
  });

  it("the token in the URL verifies cleanly", () => {
    const url = buildUnsubscribeUrl("https://app.example.com", "t1", "bob@acme.com");
    const token = new URL(url).searchParams.get("token")!;
    expect(verifyUnsubscribeToken("t1", "bob@acme.com", token)).toBe(true);
  });
});
