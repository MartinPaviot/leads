import { describe, it, expect } from "vitest";
import { normalizeProfile, aiEnabled, isZeroRetention } from "@/lib/inbox/ai-profile";

describe("ai-profile (INBOX-P03)", () => {
  it("normalizes valid profiles and falls back to standard", () => {
    expect(normalizeProfile("zero_retention")).toBe("zero_retention");
    expect(normalizeProfile("off")).toBe("off");
    expect(normalizeProfile("standard")).toBe("standard");
    expect(normalizeProfile("bogus")).toBe("standard");
    expect(normalizeProfile(undefined)).toBe("standard");
    expect(normalizeProfile(42)).toBe("standard");
  });

  it("aiEnabled is false only when off (fail-closed gate)", () => {
    expect(aiEnabled("standard")).toBe(true);
    expect(aiEnabled("zero_retention")).toBe(true);
    expect(aiEnabled("off")).toBe(false);
  });

  it("isZeroRetention flags only the zero-retention profile", () => {
    expect(isZeroRetention("zero_retention")).toBe(true);
    expect(isZeroRetention("standard")).toBe(false);
    expect(isZeroRetention("off")).toBe(false);
  });
});
