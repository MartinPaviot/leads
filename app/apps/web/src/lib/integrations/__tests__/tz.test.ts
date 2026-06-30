import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  toZonedNaiveIso,
  toIcsLocal,
  zonedWeekday,
  zonedYmdDay,
} from "@/lib/integrations/tz";

// Europe/Paris is CET (+1) in winter, CEST (+2) in summer. A 09:00 LOCAL meeting
// is therefore 08:00Z in January and 07:00Z in July — different UTC instants,
// same wall-clock. That invariant is the whole point of zoning a recurring series.
const PARIS_WINTER_0900 = new Date("2026-01-13T08:00:00.000Z");
const PARIS_SUMMER_0900 = new Date("2026-07-06T07:00:00.000Z");

describe("tz — zoned wall-clock helpers", () => {
  it("isValidTimeZone accepts IANA zones, rejects junk/empty", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("toIcsLocal renders the LOCAL stamp and is DST-stable (09:00 both seasons)", () => {
    expect(toIcsLocal(PARIS_WINTER_0900, "Europe/Paris")).toBe("20260113T090000");
    expect(toIcsLocal(PARIS_SUMMER_0900, "Europe/Paris")).toBe("20260706T090000");
    expect(toIcsLocal(PARIS_SUMMER_0900, "Mars/Olympus")).toBeNull();
  });

  it("toZonedNaiveIso renders the Google/Graph naive local datetime (no Z)", () => {
    expect(toZonedNaiveIso(PARIS_SUMMER_0900, "Europe/Paris")).toBe("2026-07-06T09:00:00");
    expect(toZonedNaiveIso(PARIS_WINTER_0900, "Europe/Paris")).toBe("2026-01-13T09:00:00");
  });

  it("zonedWeekday / zonedYmdDay use the LOCAL date (can differ from UTC)", () => {
    // Mon 23:30 UTC is already Tue 01:30 in Paris (CEST +2).
    const crossesMidnight = new Date("2026-07-06T23:30:00.000Z");
    expect(zonedWeekday(crossesMidnight, "Europe/Paris")).toBe("tuesday");
    expect(zonedYmdDay(crossesMidnight, "Europe/Paris")).toEqual({ ymd: "2026-07-07", dayOfMonth: 7 });
    // Same instant in UTC is still Monday the 6th.
    expect(zonedWeekday(crossesMidnight, "UTC")).toBe("monday");
    expect(zonedYmdDay(crossesMidnight, "UTC")).toEqual({ ymd: "2026-07-06", dayOfMonth: 6 });
  });
});
