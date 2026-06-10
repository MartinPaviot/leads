import { describe, it, expect } from "vitest";
import { segmentImpact, impactDisplayable } from "@/lib/voice/script-context";

describe("segmentImpact", () => {
  it("splits week totals into with/without-reason buckets", () => {
    expect(segmentImpact(20, 4, 8, 3)).toEqual({
      withReason: { calls: 8, meetings: 3 },
      withoutReason: { calls: 12, meetings: 1 },
    });
  });

  it("clamps against counting races — never negative, meetings ≤ calls", () => {
    // reason counters momentarily ahead of the week totals
    expect(segmentImpact(5, 1, 8, 3)).toEqual({
      withReason: { calls: 8, meetings: 3 },
      withoutReason: { calls: 0, meetings: 0 },
    });
    // reason meetings reported above reason calls
    expect(segmentImpact(10, 5, 2, 4).withReason).toEqual({ calls: 2, meetings: 2 });
  });

  it("zero traffic → empty buckets", () => {
    expect(segmentImpact(0, 0, 0, 0)).toEqual({
      withReason: { calls: 0, meetings: 0 },
      withoutReason: { calls: 0, meetings: 0 },
    });
  });
});

describe("impactDisplayable", () => {
  it("requires a minimal sample in BOTH buckets", () => {
    expect(impactDisplayable(segmentImpact(20, 4, 8, 3))).toBe(true);
    expect(impactDisplayable(segmentImpact(20, 4, 2, 1))).toBe(false); // few with-reason
    expect(impactDisplayable(segmentImpact(8, 2, 6, 2))).toBe(false); // few without-reason
  });
});
