import { describe, it, expect } from "vitest";
import { decideAutoPauseActions } from "../auto-pause";
import { type SequenceHealth } from "../sequence-health";

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

const dead = h({ sequenceId: "dead", sent: 128, replies: 0, replyRate: 0, meetingsBooked: 0 });
const healthy = h({ sequenceId: "ok", sent: 128, replies: 5, replyRate: 5 / 128, meetingsBooked: 1 });
const newish = h({ sequenceId: "new", sent: 10 });
const protectedSeq = h({ sequenceId: "prot", sent: 500, autopilotProtected: true });

describe("decideAutoPauseActions", () => {
  it("mode off → never acts, even on a dead sequence", () => {
    expect(decideAutoPauseActions([dead], "off")[0].action).toBe("none");
  });

  it("mode shadow → notify on dead, never pause", () => {
    expect(decideAutoPauseActions([dead], "shadow")[0].action).toBe("notify");
  });

  it("mode enforce → pause on dead", () => {
    expect(decideAutoPauseActions([dead], "enforce")[0].action).toBe("pause");
  });

  it("healthy / under-sample / protected → none under enforce", () => {
    const acts = decideAutoPauseActions([healthy, newish, protectedSeq], "enforce");
    expect(acts.every((a) => a.action === "none")).toBe(true);
    expect(acts.map((a) => a.verdict)).toEqual(["healthy", "insufficient_data", "protected"]);
  });

  it("carries sequence identity + reason through to the action", () => {
    const a = decideAutoPauseActions([dead], "enforce")[0];
    expect(a.sequenceId).toBe("dead");
    expect(a.reason).toContain("dead_sequence");
  });
});
