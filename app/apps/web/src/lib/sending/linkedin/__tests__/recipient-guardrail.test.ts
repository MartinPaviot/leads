import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isLinkedInTestMode,
  linkedinHandle,
  linkedinTargetAllowlist,
  isLinkedInTargetAllowed,
} from "../recipient-guardrail";

afterEach(() => vi.unstubAllEnvs());

describe("isLinkedInTestMode — fail-safe default ON", () => {
  it("is ON by default and on any non-off value (a typo keeps it on)", () => {
    expect(isLinkedInTestMode()).toBe(true);
    vi.stubEnv("LINKEDIN_TEST_MODE", "on");
    expect(isLinkedInTestMode()).toBe(true);
    vi.stubEnv("LINKEDIN_TEST_MODE", "yes-please");
    expect(isLinkedInTestMode()).toBe(true);
  });
  it("is OFF only on the exact 'off' value", () => {
    vi.stubEnv("LINKEDIN_TEST_MODE", "OFF");
    expect(isLinkedInTestMode()).toBe(false);
  });
});

describe("linkedinHandle (pure)", () => {
  it("extracts the /in/ slug across scheme/www/case/trailing slash/query", () => {
    expect(linkedinHandle("https://www.LinkedIn.com/in/Jane-Doe/")).toBe("jane-doe");
    expect(linkedinHandle("linkedin.com/in/jane-doe?x=1")).toBe("jane-doe");
  });
  it("accepts a bare handle", () => {
    expect(linkedinHandle("jane-doe")).toBe("jane-doe");
  });
  it("rejects empty, a path-only, or a spaced value", () => {
    expect(linkedinHandle("")).toBeNull();
    expect(linkedinHandle(null)).toBeNull();
    expect(linkedinHandle("linkedin.com/company/acme")).toBeNull();
    expect(linkedinHandle("jane doe")).toBeNull();
  });
});

describe("linkedinTargetAllowlist", () => {
  it("normalizes URLs and handles, dedupes", () => {
    vi.stubEnv("LINKEDIN_TEST_ALLOWLIST", "https://linkedin.com/in/jane-doe/, jane-doe , https://www.linkedin.com/in/bob");
    expect(linkedinTargetAllowlist().sort()).toEqual(["bob", "jane-doe"]);
  });
  it("is empty when unset", () => {
    expect(linkedinTargetAllowlist()).toEqual([]);
  });
});

describe("isLinkedInTargetAllowed", () => {
  it("test mode ON + empty allowlist => blocks EVERYTHING (fail-safe)", () => {
    expect(isLinkedInTargetAllowed("https://linkedin.com/in/jane-doe")).toBe(false);
  });
  it("test mode ON => only allowlisted handles pass", () => {
    vi.stubEnv("LINKEDIN_TEST_ALLOWLIST", "jane-doe");
    expect(isLinkedInTargetAllowed("https://www.linkedin.com/in/jane-doe/")).toBe(true);
    expect(isLinkedInTargetAllowed("https://linkedin.com/in/someone-else")).toBe(false);
    expect(isLinkedInTargetAllowed(null)).toBe(false);
  });
  it("test mode OFF => everything passes", () => {
    vi.stubEnv("LINKEDIN_TEST_MODE", "off");
    expect(isLinkedInTargetAllowed("https://linkedin.com/in/anyone")).toBe(true);
  });
});
