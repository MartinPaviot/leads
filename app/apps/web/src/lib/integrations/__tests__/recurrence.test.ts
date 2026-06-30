import { describe, it, expect } from "vitest";
import { toRRule, toGraphRecurrence, type MeetingRecurrence } from "@/lib/integrations/recurrence";

// A Monday (2026-07-06T09:00Z) so weekday/day-of-month derivations are checkable.
const MON = new Date("2026-07-06T09:00:00.000Z");

describe("toRRule — Google + ICS RRULE body", () => {
  it("maps freq to FREQ and appends COUNT only when >= 2", () => {
    expect(toRRule({ freq: "daily" })).toBe("FREQ=DAILY");
    expect(toRRule({ freq: "weekly", count: 8 })).toBe("FREQ=WEEKLY;COUNT=8");
    expect(toRRule({ freq: "monthly", count: 12 })).toBe("FREQ=MONTHLY;COUNT=12");
  });
  it("drops a meaningless count (< 2) → open-ended", () => {
    expect(toRRule({ freq: "weekly", count: 1 })).toBe("FREQ=WEEKLY");
    expect(toRRule({ freq: "daily", count: 0 })).toBe("FREQ=DAILY");
  });
  it("never emits the RRULE: prefix (callers add it)", () => {
    expect(toRRule({ freq: "weekly" })).not.toContain("RRULE:");
  });
});

describe("toGraphRecurrence — Microsoft patternedRecurrence", () => {
  it("weekly carries the start's weekday (lowercase) + numbered range with count", () => {
    const r = toGraphRecurrence({ freq: "weekly", count: 8 }, MON);
    expect(r.pattern).toEqual({ type: "weekly", interval: 1, daysOfWeek: ["monday"] });
    expect(r.range).toEqual({ type: "numbered", startDate: "2026-07-06", numberOfOccurrences: 8 });
  });
  it("monthly uses absoluteMonthly + the start's day-of-month", () => {
    const r = toGraphRecurrence({ freq: "monthly" }, MON);
    expect(r.pattern).toEqual({ type: "absoluteMonthly", interval: 1, dayOfMonth: 6 });
    expect(r.range).toEqual({ type: "noEnd", startDate: "2026-07-06" });
  });
  it("daily has no day fields; no count → noEnd (still carries startDate)", () => {
    const r = toGraphRecurrence({ freq: "daily" }, MON);
    expect(r.pattern).toEqual({ type: "daily", interval: 1 });
    expect(r.range).toEqual({ type: "noEnd", startDate: "2026-07-06" });
  });

  it("the optional zone derives weekday / day-of-month / startDate from LOCAL time", () => {
    // Mon 23:30 UTC is Tue 01:30 in Paris — the anchors must follow the zone the
    // Graph start.timeZone uses, or every occurrence is mis-placed.
    const crossesMidnight = new Date("2026-07-06T23:30:00.000Z");
    const weekly = toGraphRecurrence({ freq: "weekly", count: 8 }, crossesMidnight, "Europe/Paris");
    expect(weekly.pattern).toEqual({ type: "weekly", interval: 1, daysOfWeek: ["tuesday"] });
    expect(weekly.range).toEqual({ type: "numbered", startDate: "2026-07-07", numberOfOccurrences: 8 });

    const monthly = toGraphRecurrence({ freq: "monthly" }, crossesMidnight, "Europe/Paris");
    expect(monthly.pattern).toEqual({ type: "absoluteMonthly", interval: 1, dayOfMonth: 7 });
    expect(monthly.range).toEqual({ type: "noEnd", startDate: "2026-07-07" });

    // The 2-arg / null form keeps the UTC basis (Monday the 6th) byte-for-byte.
    const utc = toGraphRecurrence({ freq: "weekly", count: 8 }, crossesMidnight);
    expect(utc.pattern).toEqual({ type: "weekly", interval: 1, daysOfWeek: ["monday"] });
    expect(utc.range).toEqual({ type: "numbered", startDate: "2026-07-06", numberOfOccurrences: 8 });
  });
});
