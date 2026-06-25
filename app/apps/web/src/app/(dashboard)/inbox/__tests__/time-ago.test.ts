import { describe, it, expect } from "vitest";
import { mailTimestamp } from "../_time-ago";

/**
 * mailTimestamp — the Outlook/Apple-Mail style list timestamp: a clock time for
 * today, an absolute numeric date otherwise. Locale-neutral so it's stable here.
 */
describe("mailTimestamp", () => {
  it("today's mail → a clock time (H:MM)", () => {
    const d = new Date();
    d.setHours(9, 5, 0, 0);
    expect(mailTimestamp(d.toISOString())).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it("zero-pads single-digit minutes", () => {
    const d = new Date();
    d.setHours(14, 3, 0, 0);
    expect(mailTimestamp(d.toISOString())).toBe(`${d.getHours()}:03`);
  });

  it("a prior-year date → D/M/YY (no time)", () => {
    expect(mailTimestamp("2020-03-09T10:00:00")).toBe("9/3/20");
  });

  it("invalid input → empty string", () => {
    expect(mailTimestamp("not-a-date")).toBe("");
  });
});
