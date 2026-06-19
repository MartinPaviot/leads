import { describe, it, expect, afterEach, vi } from "vitest";
import { localClock, isWithinSendWindow } from "@/lib/emails/send-window";

/**
 * CLE-13 T3 — tenant-TZ send-window helper (item 4). Pure tests with frozen
 * `now` instants that fall inside the window in one zone but outside in another,
 * proving the clock is tenant-local, not UTC.
 */

const WEEKDAY = { sendDays: ["mon", "tue", "wed", "thu", "fri"], sendWindowStart: "08:00", sendWindowEnd: "18:00" };

describe("localClock — tenant-local vs UTC", () => {
  it("computes the local clock in the given timezone, not UTC", () => {
    // 2026-06-15 is a Monday. 23:30 UTC = next-day 01:30 in Europe/Zurich (UTC+2 DST).
    const now = new Date("2026-06-15T23:30:00Z");
    expect(localClock(now, "UTC")).toEqual({ day: "mon", time: "23:30" });
    // Zurich is UTC+2 in June -> Tuesday 01:30 local.
    expect(localClock(now, "Europe/Zurich")).toEqual({ day: "tue", time: "01:30" });
  });

  it("undefined timezone falls back to Europe/Paris (EC-2)", () => {
    // 2026-06-15T10:00Z -> Paris (UTC+2 in June) = 12:00 Monday.
    const now = new Date("2026-06-15T10:00:00Z");
    expect(localClock(now, undefined)).toEqual({ day: "mon", time: "12:00" });
  });
});

describe("isWithinSendWindow — tenant TZ correctness (AC-4.1/4.2/4.3)", () => {
  it("UTC instant inside the UTC window but outside Zurich's -> false for Zurich", () => {
    // 17:30 UTC Monday = 19:30 Zurich (past 18:00 end) -> outside Zurich window.
    const now = new Date("2026-06-15T17:30:00Z");
    expect(isWithinSendWindow(now, "UTC", WEEKDAY)).toBe(true);
    expect(isWithinSendWindow(now, "Europe/Zurich", WEEKDAY)).toBe(false);
  });

  it("UTC instant outside the UTC window but inside Zurich's -> true for Zurich", () => {
    // 06:30 UTC Monday = 08:30 Zurich (inside 08:00-18:00) but 06:30 UTC < 08:00.
    const now = new Date("2026-06-15T06:30:00Z");
    expect(isWithinSendWindow(now, "UTC", WEEKDAY)).toBe(false);
    expect(isWithinSendWindow(now, "Europe/Zurich", WEEKDAY)).toBe(true);
  });

  it("excludes a day not in sendDays (Sunday)", () => {
    // 2026-06-14 is a Sunday. Noon Paris is inside the time window, but Sunday is excluded.
    const now = new Date("2026-06-14T10:00:00Z");
    expect(isWithinSendWindow(now, "Europe/Paris", WEEKDAY)).toBe(false);
  });

  it("boundary: exactly at start and end are inclusive", () => {
    // Paris 08:00 (UTC+2 in June) = 06:00 UTC.
    expect(isWithinSendWindow(new Date("2026-06-15T06:00:00Z"), "Europe/Paris", WEEKDAY)).toBe(true);
    // Paris 18:00 = 16:00 UTC.
    expect(isWithinSendWindow(new Date("2026-06-15T16:00:00Z"), "Europe/Paris", WEEKDAY)).toBe(true);
    // Paris 18:01 = 16:01 UTC -> outside.
    expect(isWithinSendWindow(new Date("2026-06-15T16:01:00Z"), "Europe/Paris", WEEKDAY)).toBe(false);
  });
});

describe("localClock — malformed timezone (EC-3, fail-safe, never throws)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a bad IANA string falls back to the default TZ instead of throwing", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    // "Not/AZone" is invalid -> resolveTimezone returns it as-is -> Intl throws ->
    // helper catches and falls back to Europe/Paris (12:00 Monday in June).
    expect(() => localClock(now, "Not/AZone")).not.toThrow();
    expect(localClock(now, "Not/AZone")).toEqual({ day: "mon", time: "12:00" });
  });

  it("if even the default TZ formatter throws, returns a safe default clock (no infinite loop)", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("ICU down");
    });
    const now = new Date("2026-06-15T10:00:00Z");
    expect(() => localClock(now, undefined)).not.toThrow();
    expect(localClock(now, undefined)).toEqual({ day: "mon", time: "00:00" });
    spy.mockRestore();
  });
});
