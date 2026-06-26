import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeApiKey, isApolloAvailable } from "../apollo-client";

describe("normalizeApiKey", () => {
  it("returns a clean key unchanged", () => {
    expect(normalizeApiKey("VRtSXfAbCdEf0123456789")).toBe("VRtSXfAbCdEf0123456789");
  });

  it("strips a TRAILING NEWLINE — the bug that 401'd every Apollo call", () => {
    // `.env.local` / Vercel stored the key with a trailing newline; the raw
    // value reached the X-Api-Key header and Apollo returned 401.
    expect(normalizeApiKey("VRtSXf123\n")).toBe("VRtSXf123");
  });

  it("strips a trailing CRLF", () => {
    expect(normalizeApiKey("VRtSXf123\r\n")).toBe("VRtSXf123");
  });

  it("strips surrounding double quotes", () => {
    expect(normalizeApiKey('"VRtSXf123"')).toBe("VRtSXf123");
  });

  it("strips surrounding single quotes", () => {
    expect(normalizeApiKey("'VRtSXf123'")).toBe("VRtSXf123");
  });

  it("strips quotes AND a trailing newline together", () => {
    expect(normalizeApiKey('"VRtSXf123"\n')).toBe("VRtSXf123");
  });

  it("strips leading/trailing whitespace", () => {
    expect(normalizeApiKey("  VRtSXf123  ")).toBe("VRtSXf123");
  });

  it("returns empty string for nullish/blank input", () => {
    expect(normalizeApiKey(undefined)).toBe("");
    expect(normalizeApiKey(null)).toBe("");
    expect(normalizeApiKey("")).toBe("");
    expect(normalizeApiKey("   \n")).toBe("");
  });
});

describe("isApolloAvailable", () => {
  const prev = process.env.APOLLO_API_KEY;
  beforeEach(() => { delete process.env.APOLLO_API_KEY; });
  afterEach(() => {
    if (prev === undefined) delete process.env.APOLLO_API_KEY;
    else process.env.APOLLO_API_KEY = prev;
  });

  it("is false when unset", () => {
    expect(isApolloAvailable()).toBe(false);
  });

  it("is false for a whitespace-only value (would have read as 'available' before)", () => {
    process.env.APOLLO_API_KEY = "\n";
    expect(isApolloAvailable()).toBe(false);
  });

  it("is true for a real key even with a trailing newline", () => {
    process.env.APOLLO_API_KEY = "VRtSXf123\n";
    expect(isApolloAvailable()).toBe(true);
  });
});
