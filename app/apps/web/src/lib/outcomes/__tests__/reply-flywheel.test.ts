import { describe, it, expect } from "vitest";
import {
  shouldPromoteReplyOutcome,
  buildReplySnapshot,
  REPLY_FLYWHEEL_AGENT_ID,
  REPLY_FLYWHEEL_ACTION_TYPE,
} from "../reply-flywheel";

/**
 * P3 — outcome→learn loop. The pure decision core: which resolved outcomes
 * are strong enough evidence to promote a reply into the few-shot pool, and
 * what gets stored as the candidate. Table-driven so the positivity bar is
 * locked, not buried in the Inngest handler.
 */

describe("shouldPromoteReplyOutcome", () => {
  const cases: Array<[string, string, number, boolean]> = [
    ["replied_positive (1.0) on a reply -> promote", REPLY_FLYWHEEL_ACTION_TYPE, 1.0, true],
    ["meeting_booked (0.9) on a reply -> promote", REPLY_FLYWHEEL_ACTION_TYPE, 0.9, true],
    ["deal_advanced (0.8) on a reply -> promote (the floor)", REPLY_FLYWHEEL_ACTION_TYPE, 0.8, true],
    ["replied_neutral (0.4) on a reply -> NOT promoted (not strong enough)", REPLY_FLYWHEEL_ACTION_TYPE, 0.4, false],
    ["email_opened (0.1) on a reply -> NOT promoted", REPLY_FLYWHEEL_ACTION_TYPE, 0.1, false],
    ["no_response (0.0) on a reply -> NOT promoted", REPLY_FLYWHEEL_ACTION_TYPE, 0.0, false],
    ["replied_negative (-0.3) on a reply -> NOT promoted", REPLY_FLYWHEEL_ACTION_TYPE, -0.3, false],
    ["a high-positivity outcome on a DIFFERENT actionType -> NOT promoted (scoped to replies only)", "advance_deal", 1.0, false],
    ["a high-positivity outcome on an autopilot agent action -> NOT promoted", "send_followup", 0.9, false],
  ];
  for (const [name, actionType, positivity, expected] of cases) {
    it(name, () => expect(shouldPromoteReplyOutcome(actionType, positivity)).toBe(expected));
  }
});

describe("buildReplySnapshot", () => {
  it("pairs the inbound text with the sent reply, tagged with the reply agentId", () => {
    const snap = buildReplySnapshot({
      inboundText: "What does it cost for 8 seats?",
      replyBody: "8 seats runs $X/mo — want me to hold Thursday 2pm to walk through it?",
    });
    expect(snap.agentId).toBe(REPLY_FLYWHEEL_AGENT_ID);
    expect(snap.input).toBe("What does it cost for 8 seats?");
    expect(snap.output).toContain("Thursday 2pm");
  });

  it("trims whitespace and degrades to an empty input when there's no inbound context (no crash)", () => {
    const snap = buildReplySnapshot({ inboundText: null, replyBody: "  Following up on this.  " });
    expect(snap.input).toBe("");
    expect(snap.output).toBe("Following up on this.");
  });

  it("truncates a very long thread/reply so the candidate row stays bounded", () => {
    const long = "x".repeat(5000);
    const snap = buildReplySnapshot({ inboundText: long, replyBody: long });
    expect(snap.input.length).toBe(2000);
    expect(snap.output.length).toBe(2000);
  });
});
