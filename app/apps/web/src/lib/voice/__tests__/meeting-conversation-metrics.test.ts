import { describe, it, expect } from "vitest";
import { computeMeetingConversationMetrics, type MeetingSegment } from "../conversation-metrics";

const seg = (speaker: string | null, startSec: number, endSec: number, text: string): MeetingSegment => ({ speaker, startSec, endSec, text });

describe("computeMeetingConversationMetrics", () => {
  it("returns null for a thin exchange (< 3 turns)", () => {
    expect(computeMeetingConversationMetrics([seg("Paul", 0, 10, "hi"), seg("Martin", 10, 20, "hey")])).toBeNull();
  });

  it("returns null with a single speaker (a monologue is not a conversation)", () => {
    expect(
      computeMeetingConversationMetrics([seg("Paul", 0, 20, "a"), seg("Paul", 20, 40, "b"), seg("Paul", 40, 60, "c")]),
    ).toBeNull();
  });

  it("returns null when total speech is under 30s", () => {
    expect(
      computeMeetingConversationMetrics([seg("Paul", 0, 5, "a"), seg("Martin", 5, 8, "b"), seg("Paul", 8, 12, "c")]),
    ).toBeNull();
  });

  it("computes per-speaker talk share by wall time, sorted loudest first", () => {
    const m = computeMeetingConversationMetrics([
      seg("Paul", 0, 60, "long stretch from paul"),
      seg("Martin", 60, 80, "shorter from martin"),
      seg("Paul", 80, 100, "more paul"),
      seg("Martin", 100, 110, "brief"),
    ])!;
    expect(m).not.toBeNull();
    expect(m.participantCount).toBe(2);
    // Paul: 60+20=80s, Martin: 20+10=30s → total 110s → Paul 73%, Martin 27%
    expect(m.perSpeaker[0].speaker).toBe("Paul");
    expect(m.perSpeaker[0].talkSeconds).toBe(80);
    expect(m.perSpeaker[0].talkPct).toBe(73);
    expect(m.perSpeaker[1].speaker).toBe("Martin");
    expect(m.perSpeaker[1].talkPct).toBe(27);
    expect(m.perSpeaker[0].talkPct + m.perSpeaker[1].talkPct).toBeGreaterThanOrEqual(99);
  });

  it("counts speaker switches and derives interactivity per minute", () => {
    const m = computeMeetingConversationMetrics([
      seg("Paul", 0, 30, "a?"),
      seg("Martin", 30, 60, "b"),
      seg("Paul", 60, 90, "c"),
      seg("Martin", 90, 120, "d"),
    ])!;
    expect(m.speakerSwitches).toBe(3);
    expect(m.durationSec).toBe(120);
    // 3 switches over 2 minutes = 1.5/min
    expect(m.interactivityPerMin).toBe(1.5);
  });

  it("measures the longest monologue as the longest same-speaker run", () => {
    const m = computeMeetingConversationMetrics([
      seg("Paul", 0, 40, "one"),
      seg("Paul", 40, 100, "still paul"), // 100s continuous Paul run
      seg("Martin", 100, 130, "finally martin"),
      seg("Paul", 130, 150, "back"),
    ])!;
    expect(m.longestMonologueSec).toBe(100);
  });

  it("attributes questions to the asking speaker", () => {
    const m = computeMeetingConversationMetrics([
      seg("Paul", 0, 40, "what do you think? and this?"),
      seg("Martin", 40, 80, "no questions here"),
      seg("Paul", 80, 120, "one more?"),
    ])!;
    const paul = m.perSpeaker.find((s) => s.speaker === "Paul")!;
    const martin = m.perSpeaker.find((s) => s.speaker === "Martin")!;
    expect(paul.questionsAsked).toBe(3);
    expect(martin.questionsAsked).toBe(0);
  });
});
