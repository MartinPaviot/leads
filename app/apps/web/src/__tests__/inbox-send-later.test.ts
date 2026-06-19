import { describe, it, expect } from "vitest";
import { computeSendAt, isWithinUndoWindow, undoDeadline } from "@/lib/inbox/send-later";

const NOW = new Date(2026, 5, 17, 10, 0, 0);

describe("computeSendAt (INBOX-C11)", () => {
  it("resolves a relative or absolute schedule via the shared parser", () => {
    expect(computeSendAt("in 5m", NOW)!.getTime() - NOW.getTime()).toBe(5 * 60_000);
    const tm = computeSendAt("tomorrow 9am", NOW)!;
    expect(tm.getDate()).toBe(18);
    expect(tm.getHours()).toBe(9);
  });
  it("returns null for unparseable schedules", () => {
    expect(computeSendAt("whenever", NOW)).toBeNull();
  });
});

describe("undo window (INBOX-C11)", () => {
  it("is open inside the grace period and closed after", () => {
    const sent = 1_000_000;
    expect(isWithinUndoWindow(sent, sent + 5_000)).toBe(true);
    expect(isWithinUndoWindow(sent, sent + 31_000)).toBe(false);
  });
  it("is not open before the send time", () => {
    expect(isWithinUndoWindow(1_000_000, 999_000)).toBe(false);
  });
  it("computes the deadline", () => {
    expect(undoDeadline(1_000_000, 30)).toBe(1_030_000);
  });
});
