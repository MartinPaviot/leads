import { describe, it, expect } from "vitest";
import { classifySequence, type SequenceHealth } from "../sequence-health";

function h(over: Partial<SequenceHealth>): SequenceHealth {
  return {
    sequenceId: "s1",
    name: "Seq",
    sent: 0,
    replies: 0,
    meetingsBooked: 0,
    replyRate: 0,
    oldestSendAt: null,
    autopilotProtected: false,
    ...over,
  };
}

describe("classifySequence", () => {
  it("0 sends → insufficient_data (0 sends is untested, not dead)", () => {
    expect(classifySequence(h({ sent: 0 })).verdict).toBe("insufficient_data");
  });

  it("under the sample floor → insufficient_data; exactly at the floor is evaluated", () => {
    expect(classifySequence(h({ sent: 49 })).verdict).toBe("insufficient_data");
    expect(classifySequence(h({ sent: 50, replies: 0, replyRate: 0, meetingsBooked: 0 })).verdict).toBe("dead");
  });

  it("sample met, 0 meetings, reply rate under floor → dead", () => {
    const c = classifySequence(h({ sent: 128, replies: 0, replyRate: 0, meetingsBooked: 0 }));
    expect(c.verdict).toBe("dead");
    expect(c.reason).toContain("dead_sequence");
    expect(c.reason).toContain("sent=128");
  });

  it("a booked meeting keeps it healthy even with 0 replies", () => {
    expect(classifySequence(h({ sent: 128, replies: 0, replyRate: 0, meetingsBooked: 1 })).verdict).toBe("healthy");
  });

  it("reply rate above the floor → healthy", () => {
    expect(classifySequence(h({ sent: 128, replies: 2, replyRate: 2 / 128, meetingsBooked: 0 })).verdict).toBe("healthy");
  });

  it("a trickle of replies still under the floor, 0 meetings → dead", () => {
    // 1 reply / 200 sends = 0.5% < 1% floor
    expect(classifySequence(h({ sent: 200, replies: 1, replyRate: 1 / 200, meetingsBooked: 0 })).verdict).toBe("dead");
  });

  it("human-protected → never dead (errs toward the operator)", () => {
    const c = classifySequence(h({ sent: 1000, replies: 0, replyRate: 0, meetingsBooked: 0, autopilotProtected: true }));
    expect(c.verdict).toBe("protected");
  });

  it("respects injected thresholds (looser sample floor defers judgement)", () => {
    const lenient = { minSample: 500, windowDays: 14, replyFloor: 0.01 };
    expect(classifySequence(h({ sent: 128, replyRate: 0 }), lenient).verdict).toBe("insufficient_data");
  });
});
