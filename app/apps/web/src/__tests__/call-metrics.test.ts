import { describe, it, expect } from "vitest";
import {
  CONNECT_OUTCOMES,
  EMPTY_OUTCOME_COUNTS,
  countConnects,
  computeCallMetrics,
  bestWindows,
  fmtPct,
  fmtRatio,
  RATE_SAMPLE_FLOOR,
  type OutcomeCounts,
} from "@/lib/voice/call-metrics";

function counts(partial: Partial<OutcomeCounts>): OutcomeCounts {
  return { ...EMPTY_OUTCOME_COUNTS, ...partial };
}

describe("CONNECT_OUTCOMES", () => {
  it("counts a not_interested as a connect but never a gatekeeper", () => {
    expect(CONNECT_OUTCOMES).toContain("not_interested");
    expect(CONNECT_OUTCOMES).not.toContain("gatekeeper");
    expect(CONNECT_OUTCOMES).not.toContain("voicemail_left");
    expect(CONNECT_OUTCOMES).not.toContain("no_answer");
  });

  it("countConnects sums the four connect outcomes only", () => {
    const c = counts({
      connected: 3,
      meeting_booked: 2,
      callback_requested: 1,
      not_interested: 4,
      gatekeeper: 5, // excluded
      no_answer: 9, // excluded
    });
    expect(countConnects(c)).toBe(10);
  });
});

describe("computeCallMetrics — sample floor (no noise)", () => {
  it("suppresses a rate below the dial floor (a rate on 3 dials is an anecdote)", () => {
    const m = computeCallMetrics(counts({ dials: 3, connected: 1, no_answer: 2 }));
    expect(m.connectRate.value).toBeNull();
    expect(m.nrpRate.value).toBeNull();
    // raw numerator/denominator are still carried for context
    expect(m.nrpRate.num).toBe(2);
    expect(m.nrpRate.den).toBe(3);
  });

  it("computes the rate once the floor is met", () => {
    const m = computeCallMetrics(
      counts({ dials: 100, connected: 8, no_answer: 60, voicemail_left: 20, busy: 5, wrong_number: 7 }),
    );
    expect(m.connectRate.value).toBeCloseTo(0.08, 5);
    expect(m.nrpRate.value).toBeCloseTo(0.6, 5);
    expect(m.voicemailRate.value).toBeCloseTo(0.2, 5);
    expect(m.busyRate.value).toBeCloseTo(0.05, 5);
    expect(m.badNumberRate.value).toBeCloseTo(0.07, 5);
  });

  it("floor boundary is inclusive at RATE_SAMPLE_FLOOR", () => {
    const m = computeCallMetrics(counts({ dials: RATE_SAMPLE_FLOOR, no_answer: 10 }));
    expect(m.nrpRate.value).toBeCloseTo(0.5, 5);
  });
});

describe("computeCallMetrics — efficiency ratios", () => {
  it("dials-per-meeting and dials-per-connect reflect real effort", () => {
    const m = computeCallMetrics(
      counts({ dials: 90, connected: 9, meeting_booked: 2, not_interested: 9 }),
    );
    // connects = connected(9) + meeting_booked(2) + not_interested(9) = 20
    expect(m.connects).toBe(20);
    expect(m.dialsPerConnect).toBeCloseTo(90 / 20, 5);
    expect(m.dialsPerMeeting).toBeCloseTo(90 / 2, 5);
    // meeting conversion = meetings / connects, connect-denominated floor
    expect(m.meetingConversion.value).toBeCloseTo(2 / 20, 5);
  });

  it("dials-per-meeting is null when no meeting was booked", () => {
    const m = computeCallMetrics(counts({ dials: 90, connected: 9 }));
    expect(m.dialsPerMeeting).toBeNull();
  });

  it("ratios stay null below the dial floor", () => {
    const m = computeCallMetrics(counts({ dials: 5, connected: 2, meeting_booked: 1 }));
    expect(m.dialsPerMeeting).toBeNull();
    expect(m.dialsPerConnect).toBeNull();
  });
});

describe("bestWindows — best time to call", () => {
  it("ranks by connect rate and drops low-sample buckets", () => {
    const ranked = bestWindows([
      { key: 9, dials: 40, connects: 4 }, // 10%
      { key: 16, dials: 30, connects: 9 }, // 30% ← best
      { key: 12, dials: 25, connects: 5 }, // 20%
      { key: 8, dials: 3, connects: 3 }, // 100% but only 3 dials → dropped
    ]);
    expect(ranked.map((b) => b.key)).toEqual([16, 12, 9]);
    expect(ranked[0].connectRate).toBeCloseTo(0.3, 5);
    expect(ranked.find((b) => b.key === 8)).toBeUndefined();
  });

  it("returns at most n, best first", () => {
    const ranked = bestWindows(
      [
        { key: 1, dials: 50, connects: 5 },
        { key: 2, dials: 50, connects: 10 },
        { key: 3, dials: 50, connects: 15 },
      ],
      2,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked.map((b) => b.key)).toEqual([3, 2]);
  });

  it("empty history yields no window", () => {
    expect(bestWindows([])).toEqual([]);
  });
});

describe("formatting", () => {
  it("fmtPct shows one decimal under 10% and an em dash for null", () => {
    expect(fmtPct(0.082)).toBe("8.2%");
    expect(fmtPct(0.25)).toBe("25%");
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct({ value: null, num: 1, den: 2 })).toBe("—");
    expect(fmtPct({ value: 0.6, num: 60, den: 100 })).toBe("60%");
  });

  it("fmtRatio shows one decimal under 10 and an em dash for null", () => {
    expect(fmtRatio(4.5)).toBe("4.5");
    expect(fmtRatio(45)).toBe("45");
    expect(fmtRatio(null)).toBe("—");
  });
});
