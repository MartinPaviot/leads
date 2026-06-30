import { describe, it, expect } from "vitest";
import { isInternalMeeting } from "@/lib/recording/branding";

describe("isInternalMeeting", () => {
  it("true when every attendee shares the org domain", () => {
    expect(isInternalMeeting(["martin@elevay.dev", "paul@elevay.dev"], "elevay.dev")).toBe(true);
  });

  it("false when any attendee is external", () => {
    expect(isInternalMeeting(["martin@elevay.dev", "sarah@acme.com"], "elevay.dev")).toBe(false);
  });

  it("false when the org domain is unknown (fail toward external)", () => {
    expect(isInternalMeeting(["martin@elevay.dev"], null)).toBe(false);
  });

  it("false when no attendee has a parseable domain", () => {
    expect(isInternalMeeting(["", "notanemail"], "elevay.dev")).toBe(false);
  });

  it("matches a configured domain alias", () => {
    expect(isInternalMeeting(["martin@elevay.io"], "elevay.dev", ["elevay.io"])).toBe(true);
  });
});
