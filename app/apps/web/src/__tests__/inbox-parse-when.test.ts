import { describe, it, expect } from "vitest";
import { parseWhen } from "@/lib/inbox/parse-when";

// Wednesday-agnostic: assertions use getDay()/getHours(), not absolute dates.
const NOW = new Date(2026, 5, 17, 10, 0, 0); // 17 Jun 2026, 10:00 local
const DAY = 86_400_000;

describe("parseWhen (INBOX-T05)", () => {
  it("parses pure relative offsets", () => {
    expect(parseWhen("2d", NOW)!.getTime() - NOW.getTime()).toBe(2 * DAY);
    expect(parseWhen("3 days", NOW)!.getTime() - NOW.getTime()).toBe(3 * DAY);
    expect(parseWhen("in 2 days", NOW)!.getTime() - NOW.getTime()).toBe(2 * DAY);
    expect(parseWhen("2h", NOW)!.getTime() - NOW.getTime()).toBe(2 * 3_600_000);
    expect(parseWhen("30m", NOW)!.getTime() - NOW.getTime()).toBe(30 * 60_000);
    expect(parseWhen("1w", NOW)!.getTime() - NOW.getTime()).toBe(7 * DAY);
  });

  it("parses tomorrow with default and explicit time", () => {
    const t = parseWhen("tomorrow", NOW)!;
    expect(t.getDate()).toBe(18);
    expect(t.getHours()).toBe(8);
    const t2 = parseWhen("tomorrow 9am", NOW)!;
    expect(t2.getDate()).toBe(18);
    expect(t2.getHours()).toBe(9);
  });

  it("parses today / tonight", () => {
    expect(parseWhen("today 3pm", NOW)!.getHours()).toBe(15);
    expect(parseWhen("tonight", NOW)!.getHours()).toBe(19);
  });

  it("resolves a weekday to its next occurrence at 8am", () => {
    const mon = parseWhen("monday", NOW)!;
    expect(mon.getDay()).toBe(1);
    expect(mon.getHours()).toBe(8);
    expect(mon.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("resolves a weekday with a clock", () => {
    const fri = parseWhen("friday 2pm", NOW)!;
    expect(fri.getDay()).toBe(5);
    expect(fri.getHours()).toBe(14);
  });

  it("resolves next week (Monday) and this weekend (Saturday)", () => {
    expect(parseWhen("next week", NOW)!.getDay()).toBe(1);
    expect(parseWhen("this weekend", NOW)!.getDay()).toBe(6);
  });

  it("resolves a bare clock to today-if-future else tomorrow", () => {
    const nine = parseWhen("9am", NOW)!; // 9am already passed at 10am → tomorrow
    expect(nine.getHours()).toBe(9);
    expect(nine.getDate()).toBe(18);
    const three = parseWhen("15:00", NOW)!; // still ahead → today
    expect(three.getHours()).toBe(15);
    expect(three.getDate()).toBe(17);
  });

  it("returns null for unparseable input", () => {
    expect(parseWhen("bananas", NOW)).toBeNull();
    expect(parseWhen("", NOW)).toBeNull();
    expect(parseWhen("next month", NOW)).toBeNull();
  });
});
