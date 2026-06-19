import { describe, it, expect } from "vitest";
import {
  resolveAttendance,
  tallyShowStats,
  computeShowStats,
  isMeetingAttendance,
  SHOW_RATE_SAMPLE_FLOOR,
  type AttendanceSignals,
  type ResolvedAttendance,
} from "@/lib/meetings/attendance";

describe("resolveAttendance", () => {
  it("the rep's explicit mark wins over every inferred signal", () => {
    expect(
      resolveAttendance({ explicit: "no_show", isPast: true, recorded: true, calendarStatus: "confirmed" }),
    ).toBe("no_show");
    expect(resolveAttendance({ explicit: "held", isPast: false })).toBe("held");
  });

  it("a cancelled calendar event never happened", () => {
    expect(resolveAttendance({ calendarStatus: "cancelled", isPast: true })).toBe("cancelled");
  });

  it("a recording proves a past meeting was held", () => {
    expect(resolveAttendance({ isPast: true, recorded: true })).toBe("held");
  });

  it("a past meeting with no evidence is unknown (to qualify), not assumed held", () => {
    expect(resolveAttendance({ isPast: true, recorded: false })).toBe("unknown");
    expect(resolveAttendance({ isPast: true })).toBe("unknown");
  });

  it("an upcoming meeting is scheduled", () => {
    expect(resolveAttendance({ isPast: false })).toBe("scheduled");
    expect(resolveAttendance({ isPast: false, recorded: false })).toBe("scheduled");
  });
});

describe("tallyShowStats", () => {
  function n(held: number, noShow: number, other: ResolvedAttendance[] = []): ResolvedAttendance[] {
    return [
      ...Array<ResolvedAttendance>(held).fill("held"),
      ...Array<ResolvedAttendance>(noShow).fill("no_show"),
      ...other,
    ];
  }

  it("computes the rate over qualified meetings once the floor is met", () => {
    const s = tallyShowStats(n(8, 2, ["cancelled", "unknown", "unknown", "scheduled"]));
    expect(s.held).toBe(8);
    expect(s.noShow).toBe(2);
    expect(s.qualified).toBe(10);
    expect(s.cancelled).toBe(1);
    expect(s.unknown).toBe(2);
    expect(s.scheduled).toBe(1);
    expect(s.showRate.value).toBeCloseTo(0.8, 5);
  });

  it("suppresses the rate below the qualified-meetings floor", () => {
    const s = tallyShowStats(n(3, 1));
    expect(s.qualified).toBe(4);
    expect(s.showRate.value).toBeNull();
    // raw num/den still carried for context
    expect(s.showRate.num).toBe(3);
    expect(s.showRate.den).toBe(4);
  });

  it("floor boundary is inclusive at SHOW_RATE_SAMPLE_FLOOR", () => {
    const s = tallyShowStats(n(SHOW_RATE_SAMPLE_FLOOR, 0));
    expect(s.showRate.value).toBeCloseTo(1, 5);
  });

  it("cancelled and unknown never enter the denominator", () => {
    const s = tallyShowStats([
      ...Array<ResolvedAttendance>(12).fill("held"),
      ...Array<ResolvedAttendance>(20).fill("cancelled"),
      ...Array<ResolvedAttendance>(30).fill("unknown"),
    ]);
    expect(s.qualified).toBe(12);
    expect(s.showRate.value).toBeCloseTo(1, 5); // 12/12 — cancelled/unknown excluded
    expect(s.unknown).toBe(30); // still surfaced so coverage is visible
  });
});

describe("computeShowStats (resolve + tally)", () => {
  it("turns raw meeting signals into a floor-gated rate", () => {
    const meetings: AttendanceSignals[] = [
      ...Array<AttendanceSignals>(9).fill({ isPast: true, recorded: true }), // held
      { isPast: true, explicit: "no_show" },
      { isPast: true, explicit: "no_show" },
      { isPast: true, recorded: false }, // unknown
      { calendarStatus: "cancelled", isPast: true }, // cancelled
      { isPast: false }, // scheduled
    ];
    const s = computeShowStats(meetings);
    expect(s.held).toBe(9);
    expect(s.noShow).toBe(2);
    expect(s.qualified).toBe(11);
    expect(s.showRate.value).toBeCloseTo(9 / 11, 5);
    expect(s.unknown).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.scheduled).toBe(1);
  });
});

describe("isMeetingAttendance", () => {
  it("accepts only the two markable values", () => {
    expect(isMeetingAttendance("held")).toBe(true);
    expect(isMeetingAttendance("no_show")).toBe(true);
    expect(isMeetingAttendance("cancelled")).toBe(false);
    expect(isMeetingAttendance(null)).toBe(false);
    expect(isMeetingAttendance("HELD")).toBe(false);
  });
});
