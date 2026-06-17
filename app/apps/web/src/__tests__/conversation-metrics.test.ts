import { describe, it, expect } from "vitest";
import {
  computeConversationMetrics,
  aggregateConversation,
  conversationFromTranscript,
  CONVERSATION_SAMPLE_FLOOR,
  type TranscriptChunk,
  type ConversationMetrics,
} from "@/lib/voice/conversation-metrics";

const LONG = "Effectivement c'est un vrai sujet pour nous en ce moment dans l'équipe.";

describe("computeConversationMetrics — guards", () => {
  it("returns null on a transcript too thin to characterise", () => {
    expect(computeConversationMetrics([])).toBeNull();
    expect(
      computeConversationMetrics([
        { speaker: "agent", text: "Allô ?", tsMs: 0 },
        { speaker: "prospect", text: "Oui", tsMs: 1000 },
      ]),
    ).toBeNull();
  });

  it("returns null when only one side spoke (voicemail / agent-only)", () => {
    expect(
      computeConversationMetrics([
        { speaker: "agent", text: LONG, tsMs: 0 },
        { speaker: "agent", text: LONG, tsMs: 4000 },
        { speaker: "agent", text: LONG, tsMs: 8000 },
      ]),
    ).toBeNull();
  });

  it("returns null when there are turns but barely any words", () => {
    expect(
      computeConversationMetrics([
        { speaker: "agent", text: "a", tsMs: 0 },
        { speaker: "prospect", text: "b", tsMs: 1000 },
        { speaker: "agent", text: "c", tsMs: 2000 },
      ]),
    ).toBeNull();
  });
});

describe("computeConversationMetrics — a real exchange", () => {
  const chunks: TranscriptChunk[] = [
    { speaker: "agent", text: "Bonjour, Martin de chez nous, vous avez deux minutes ?", tsMs: 0 },
    { speaker: "prospect", text: "Oui allez-y, je vous écoute.", tsMs: 4000 },
    { speaker: "agent", text: "Je vous appelle car vous gérez l'IT et la souveraineté des données, ça vous parle ?", tsMs: 6000 },
    { speaker: "prospect", text: LONG, tsMs: 14000 },
    { speaker: "agent", text: "Qu'est-ce qui vous bloque aujourd'hui concrètement ?", tsMs: 17000 },
    { speaker: "prospect", text: "Le coût et la migration des données historiques surtout.", tsMs: 20000 },
  ];

  it("counts questions, switches, and the longest monologue", () => {
    const m = computeConversationMetrics(chunks)!;
    expect(m).not.toBeNull();
    expect(m.questionsAsked).toBe(3); // three agent turns end with "?"
    expect(m.speakerSwitches).toBe(5); // strictly alternating, 6 turns
    // The agent turn at 6s runs until the prospect takes over at 14s → 8s gap.
    expect(m.longestMonologueSec).toBe(8);
    expect(m.durationSec).toBeGreaterThan(20);
    expect(m.agentTalkPct).toBeGreaterThan(0);
    expect(m.agentTalkPct).toBeLessThan(100);
    expect(m.interactivityPerMin).not.toBeNull();
    expect(m.interactivityPerMin!).toBeGreaterThan(0);
  });

  it("flags a long agent monologue", () => {
    const monologue: TranscriptChunk[] = [
      { speaker: "agent", text: LONG, tsMs: 0 },
      { speaker: "agent", text: LONG, tsMs: 5000 },
      { speaker: "agent", text: LONG, tsMs: 10000 },
      { speaker: "prospect", text: "D'accord, je vois ce que vous voulez dire.", tsMs: 30000 },
      { speaker: "agent", text: "Du coup, on se cale un créneau ?", tsMs: 32000 },
      { speaker: "prospect", text: "Oui pourquoi pas, la semaine prochaine.", tsMs: 34000 },
    ];
    const m = computeConversationMetrics(monologue)!;
    expect(m.longestMonologueSec).toBe(30); // 0 → 30s before the prospect speaks
    expect(m.speakerSwitches).toBe(3);
    expect(m.questionsAsked).toBe(1);
  });

  it("still characterises talk balance when timing is absent", () => {
    const noTiming = chunks.map((c) => ({ speaker: c.speaker, text: c.text }));
    const m = computeConversationMetrics(noTiming)!;
    expect(m).not.toBeNull();
    expect(m.questionsAsked).toBe(3);
    expect(m.speakerSwitches).toBe(5);
    expect(m.durationSec).toBeNull();
    expect(m.longestMonologueSec).toBeNull();
    expect(m.interactivityPerMin).toBeNull();
  });
});

describe("conversationFromTranscript", () => {
  it("returns null for a non-array (corrupt / empty default)", () => {
    expect(conversationFromTranscript(null)).toBeNull();
    expect(conversationFromTranscript({})).toBeNull();
    expect(conversationFromTranscript("[]")).toBeNull();
  });
});

describe("aggregateConversation", () => {
  function metric(partial: Partial<ConversationMetrics>): ConversationMetrics {
    return {
      agentTalkPct: 55,
      questionsAsked: 3,
      speakerSwitches: 6,
      durationSec: 120,
      longestMonologueSec: 20,
      interactivityPerMin: 3,
      ...partial,
    };
  }

  it("suppresses averages below the sample floor", () => {
    const agg = aggregateConversation([metric({}), metric({})]);
    expect(agg.sample).toBe(2);
    expect(agg.avgAgentTalkPct).toBeNull();
    expect(agg.avgQuestionsAsked).toBeNull();
  });

  it("averages once the floor is met, skipping null timing", () => {
    const calls = [
      metric({ agentTalkPct: 50, questionsAsked: 2, longestMonologueSec: 10, interactivityPerMin: 4 }),
      metric({ agentTalkPct: 60, questionsAsked: 4, longestMonologueSec: 30, interactivityPerMin: 2 }),
      metric({ agentTalkPct: 55, questionsAsked: 3, longestMonologueSec: null, interactivityPerMin: null }),
      metric({ agentTalkPct: 65, questionsAsked: 5, longestMonologueSec: 20, interactivityPerMin: 3 }),
      metric({ agentTalkPct: 70, questionsAsked: 1, longestMonologueSec: 40, interactivityPerMin: 3 }),
    ];
    const agg = aggregateConversation(calls);
    expect(agg.sample).toBe(5);
    expect(agg.avgAgentTalkPct).toBe(60); // (50+60+55+65+70)/5
    expect(agg.avgQuestionsAsked).toBe(3); // (2+4+3+5+1)/5
    expect(agg.avgLongestMonologueSec).toBe(25); // (10+30+20+40)/4 — null skipped
    expect(agg.avgInteractivityPerMin).toBe(3); // (4+2+3+3)/4
  });

  it("the floor constant is the documented value", () => {
    expect(CONVERSATION_SAMPLE_FLOOR).toBe(5);
  });
});
