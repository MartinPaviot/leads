import { describe, it, expect } from "vitest";
import { extractProposedTime, toDatetimeLocal } from "@/lib/inbox/proposed-time";

// A Thursday, so "tuesday"/"friday" resolve to known future days.
const now = new Date("2026-06-18T09:00:00");

describe("extractProposedTime (INBOX-CAL02)", () => {
  it("pulls a weekday + clock time from prose", () => {
    const p = extractProposedTime("Could we do Tuesday at 3pm for the demo?", now)!;
    expect(p).not.toBeNull();
    expect(p.phrase).toBe("tuesday 3pm");
    expect(p.start.getTime()).toBeGreaterThan(now.getTime());
    expect(p.start.getHours()).toBe(15);
  });

  it("handles 'tomorrow' with a 24h time", () => {
    const p = extractProposedTime("Tomorrow 14:30 works on my end.", now)!;
    expect(p.start.getDate()).toBe(19);
    expect(p.start.getHours()).toBe(14);
    expect(p.start.getMinutes()).toBe(30);
  });

  it("returns null without a date anchor (a bare time is too ambiguous)", () => {
    expect(extractProposedTime("call me at 3pm", now)).toBeNull();
    expect(extractProposedTime("no times here", now)).toBeNull();
    expect(extractProposedTime("", now)).toBeNull();
    expect(extractProposedTime(null, now)).toBeNull();
  });

  it("ignores a past anchor (today earlier than now resolves forward or null)", () => {
    // "today" with no future time can't be in the future at 09:00 with a past clock.
    const p = extractProposedTime("today at 8am", now);
    expect(p).toBeNull();
  });
});

describe("toDatetimeLocal", () => {
  it("formats local YYYY-MM-DDTHH:MM", () => {
    expect(toDatetimeLocal(new Date("2026-06-20T15:05:00"))).toBe("2026-06-20T15:05");
  });
});
