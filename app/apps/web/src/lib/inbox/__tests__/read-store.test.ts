import { describe, it, expect } from "vitest";
import { isUnread } from "../read-store";

describe("isUnread (pure read-state)", () => {
  it("is unread when never read", () => {
    expect(isUnread(undefined, "2026-06-19T10:00:00Z")).toBe(true);
  });

  it("is read when read at/after the last message", () => {
    expect(isUnread("2026-06-19T10:00:00Z", "2026-06-19T10:00:00Z")).toBe(false);
    expect(isUnread("2026-06-19T11:00:00Z", "2026-06-19T10:00:00Z")).toBe(false);
  });

  it("re-marks unread when a newer message arrived after the read marker", () => {
    expect(isUnread("2026-06-19T10:00:00Z", "2026-06-19T12:00:00Z")).toBe(true);
  });

  it("is read when there is no message timestamp but a read marker exists", () => {
    expect(isUnread("2026-06-19T10:00:00Z", null)).toBe(false);
  });
});
