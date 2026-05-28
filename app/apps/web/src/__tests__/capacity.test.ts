import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEEP_DIVE_WEEKLY_CAP,
  DEEP_DIVE_METADATA_KEY,
  DEEP_DIVE_METADATA_VALUE,
  classifyDeepDiveLoad,
  decideDeepDiveBooking,
  getDeepDiveCap,
  getIsoWeekBounds,
  isDeepDiveActivity,
} from "@/lib/calendar/capacity";

describe("getDeepDiveCap", () => {
  it("returns the documented default when settings is null", () => {
    expect(getDeepDiveCap(null)).toBe(DEFAULT_DEEP_DIVE_WEEKLY_CAP);
    expect(DEFAULT_DEEP_DIVE_WEEKLY_CAP).toBe(2);
  });

  it("returns the default when settings is undefined", () => {
    expect(getDeepDiveCap(undefined)).toBe(DEFAULT_DEEP_DIVE_WEEKLY_CAP);
  });

  it("returns the tenant-configured cap when present", () => {
    expect(getDeepDiveCap({ deepDiveWeeklyCap: 5 })).toBe(5);
  });

  it("floors fractional caps (defensive — UI may send a float)", () => {
    expect(getDeepDiveCap({ deepDiveWeeklyCap: 3.7 })).toBe(3);
  });

  it("falls back to default on negative caps (config error)", () => {
    expect(getDeepDiveCap({ deepDiveWeeklyCap: -1 })).toBe(
      DEFAULT_DEEP_DIVE_WEEKLY_CAP,
    );
  });

  it("falls back to default on non-numeric values", () => {
    expect(getDeepDiveCap({ deepDiveWeeklyCap: "many" })).toBe(
      DEFAULT_DEEP_DIVE_WEEKLY_CAP,
    );
    expect(getDeepDiveCap({ deepDiveWeeklyCap: NaN })).toBe(
      DEFAULT_DEEP_DIVE_WEEKLY_CAP,
    );
  });

  it("accepts zero (cap=0 means deep-dives paused, not invalid)", () => {
    expect(getDeepDiveCap({ deepDiveWeeklyCap: 0 })).toBe(0);
  });
});

describe("decideDeepDiveBooking", () => {
  it("allows under cap (under_cap reason)", () => {
    expect(
      decideDeepDiveBooking({ currentWeekCount: 1, cap: 2 }),
    ).toEqual({ allowed: true, reason: "under_cap" });
  });

  it("allows at zero count regardless of cap", () => {
    expect(
      decideDeepDiveBooking({ currentWeekCount: 0, cap: 2 }),
    ).toEqual({ allowed: true, reason: "under_cap" });
  });

  it("denies at exactly the cap (boundary)", () => {
    expect(
      decideDeepDiveBooking({ currentWeekCount: 2, cap: 2 }),
    ).toEqual({ allowed: false, reason: "cap_reached" });
  });

  it("denies above the cap", () => {
    expect(
      decideDeepDiveBooking({ currentWeekCount: 4, cap: 2 }),
    ).toEqual({ allowed: false, reason: "cap_reached" });
  });

  it("always denies when cap=0 (deep-dives paused)", () => {
    expect(
      decideDeepDiveBooking({ currentWeekCount: 0, cap: 0 }),
    ).toEqual({ allowed: false, reason: "cap_reached" });
  });

  it("allows past the cap when hasOverride=true (override reason)", () => {
    expect(
      decideDeepDiveBooking({
        currentWeekCount: 5,
        cap: 2,
        hasOverride: true,
      }),
    ).toEqual({ allowed: true, reason: "override" });
  });

  it("override wins over under-cap (reason reflects the override)", () => {
    expect(
      decideDeepDiveBooking({
        currentWeekCount: 0,
        cap: 2,
        hasOverride: true,
      }),
    ).toEqual({ allowed: true, reason: "override" });
  });
});

describe("classifyDeepDiveLoad", () => {
  it("reports 'ok' under 80% of cap", () => {
    expect(classifyDeepDiveLoad(0, 5)).toBe("ok"); // 0%
    expect(classifyDeepDiveLoad(3, 5)).toBe("ok"); // 60%
  });

  it("reports 'tight' between 80% and the cap (exclusive)", () => {
    expect(classifyDeepDiveLoad(4, 5)).toBe("tight"); // 80%
  });

  it("reports 'saturated' at the cap exactly (the goulot)", () => {
    expect(classifyDeepDiveLoad(5, 5)).toBe("saturated");
  });

  it("reports 'saturated' above the cap (override took us over)", () => {
    expect(classifyDeepDiveLoad(7, 5)).toBe("saturated");
  });

  it("reports 'saturated' when cap is 0 (paused state surfaces as goulot)", () => {
    expect(classifyDeepDiveLoad(0, 0)).toBe("saturated");
  });

  it("reports 'saturated' on negative cap (pathological config)", () => {
    expect(classifyDeepDiveLoad(0, -1)).toBe("saturated");
  });

  it("transitions cleanly with cap=2 (the Pilae default — tight band collapses)", () => {
    // 80% of 2 = 1.6. Integer counts skip past it:
    //   0 = ok (0%)
    //   1 = ok (50%, still under 80%)
    //   2 = saturated (cap reached)
    // The "tight" band only exists for caps ≥ 5; at cap=2 the founder
    // sees the goulot flip straight to "saturated" without warning.
    // Acceptable trade-off for the Pilae default; the badge UI can
    // surface "1 of 2" as the soft warning.
    expect(classifyDeepDiveLoad(0, 2)).toBe("ok");
    expect(classifyDeepDiveLoad(1, 2)).toBe("ok");
    expect(classifyDeepDiveLoad(2, 2)).toBe("saturated");
  });
});

describe("getIsoWeekBounds", () => {
  it("anchors a Wednesday to Monday 00:00 UTC of that week", () => {
    const wed = new Date("2026-05-27T15:34:00Z"); // Wednesday
    const { weekStart, weekEnd } = getIsoWeekBounds(wed);
    expect(weekStart.toISOString()).toBe("2026-05-25T00:00:00.000Z"); // Mon
    expect(weekEnd.toISOString()).toBe("2026-06-01T00:00:00.000Z"); // Next Mon
  });

  it("returns an exclusive end boundary (half-open interval)", () => {
    const mon = new Date("2026-05-25T00:00:00Z");
    const { weekStart, weekEnd } = getIsoWeekBounds(mon);
    expect(weekEnd.getTime() - weekStart.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("anchors a Monday to itself, not the previous Monday", () => {
    const mon = new Date("2026-05-25T00:00:00Z");
    const { weekStart } = getIsoWeekBounds(mon);
    expect(weekStart.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("anchors a Sunday to the PREVIOUS Monday (ISO weeks end Sunday)", () => {
    const sun = new Date("2026-05-31T23:59:00Z");
    const { weekStart, weekEnd } = getIsoWeekBounds(sun);
    expect(weekStart.toISOString()).toBe("2026-05-25T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("crosses a month boundary cleanly", () => {
    // Mon 2026-04-27 → Mon 2026-05-04
    const wed = new Date("2026-04-29T10:00:00Z");
    const { weekStart, weekEnd } = getIsoWeekBounds(wed);
    expect(weekStart.toISOString()).toBe("2026-04-27T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });
});

describe("isDeepDiveActivity", () => {
  it("recognises the canonical meetingType=deep_dive tag", () => {
    expect(isDeepDiveActivity({ meetingType: "deep_dive" })).toBe(true);
    expect(DEEP_DIVE_METADATA_KEY).toBe("meetingType");
    expect(DEEP_DIVE_METADATA_VALUE).toBe("deep_dive");
  });

  it("rejects regular meetings", () => {
    expect(isDeepDiveActivity({ meetingType: "intro" })).toBe(false);
    expect(isDeepDiveActivity({ meetingType: "qualification" })).toBe(false);
    expect(isDeepDiveActivity({})).toBe(false);
  });

  it("rejects null / undefined metadata gracefully", () => {
    expect(isDeepDiveActivity(null)).toBe(false);
    expect(isDeepDiveActivity(undefined)).toBe(false);
  });
});
