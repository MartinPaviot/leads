import { describe, it, expect, vi } from "vitest";
import { buildSegment, admitsAccount, SegmentError, type Segment } from "../build";
import { estimateTam } from "../tam";

describe("buildSegment — archetypes + rules (AC1/AC2)", () => {
  it("builds a volume segment (no signal binding)", () => {
    const s = buildSegment("icpv1", "volume", { partitionBy: ["industry"], goal: "pipeline" });
    expect(s.archetype).toBe("volume");
    expect(s.signalBinding).toBeNull();
  });
  it("rejects a micro segment without a narrowing dimension", () => {
    expect(() => buildSegment("icpv1", "micro", {})).toThrow(SegmentError);
    expect(() => buildSegment("icpv1", "micro", { narrowing: [] })).toThrow(/narrowing/);
  });
  it("accepts a micro segment with a narrowing dimension", () => {
    const s = buildSegment("icpv1", "micro", { narrowing: [{ fieldKey: "technologies", operator: "contains", value: "nextjs" }] });
    expect(s.archetype).toBe("micro");
    expect(s.definition.narrowing).toHaveLength(1);
  });
  it("rejects a signal segment without a binding, accepts one with it", () => {
    expect(() => buildSegment("icpv1", "signal", {})).toThrow(/signal binding/);
    const s = buildSegment("icpv1", "signal", { signalKey: "funding_recent" });
    expect(s.signalBinding).toBe("funding_recent");
  });
  it("rejects an unknown archetype", () => {
    expect(() => buildSegment("icpv1", "broad" as never, {})).toThrow(SegmentError);
  });
});

describe("admitsAccount — signal binding + loss (AC2/AC5)", () => {
  const signalSeg: Segment = buildSegment("icpv1", "signal", { signalKey: "funding_recent" });
  it("admits a signal account only while it carries the signal", () => {
    expect(admitsAccount(signalSeg, { accountId: "a1", signals: ["funding_recent", "hiring_intent"] })).toBe(true);
    expect(admitsAccount(signalSeg, { accountId: "a2", signals: ["hiring_intent"] })).toBe(false); // lost/never had -> no new admission
  });
  it("volume/micro admit regardless of signals (filter is at sourcing)", () => {
    const vol = buildSegment("icpv1", "volume", {});
    expect(admitsAccount(vol, { accountId: "a3", signals: [] })).toBe(true);
  });
});

describe("estimateTam — count-only, credit-free (AC3)", () => {
  it("delegates to the injected count-only sourcing and returns the total", async () => {
    const count = vi.fn(async () => ({ total: 4200, capped: false }));
    const r = await estimateTam({ keywords: ["saas"], locations: ["FR"] }, { count });
    expect(r.total).toBe(4200);
    expect(count).toHaveBeenCalledTimes(1); // one cheap count call, no enrichment
  });
});
