import { describe, it, expect } from "vitest";
import {
  extractSpeakerHint,
  speakerMatches,
  applySpeakerBias,
  SPEAKER_BIAS_BOOST,
} from "@/lib/coaching/speaker-bias";

describe("extractSpeakerHint — verb-cue patterns", () => {
  it("matches 'what did X say' with high confidence", () => {
    const h = extractSpeakerHint("What did Sarah say about pricing?");
    expect(h?.name).toBe("Sarah");
    expect(h?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("matches the various verb cues", () => {
    for (const verb of [
      "say",
      "push back on",
      "object to",
      "mention",
      "ask about",
      "answer",
      "tell us",
      "claim",
      "argue",
      "reject",
      "accept",
      "state",
      "note",
      "comment on",
    ]) {
      const q = `What did Bob ${verb} the budget?`;
      const h = extractSpeakerHint(q);
      expect(h?.name).toBe("Bob");
    }
  });

  it("matches 'what does X think' style", () => {
    expect(extractSpeakerHint("What does Pat think of our pricing?")?.name).toBe("Pat");
    expect(extractSpeakerHint("What does Pat want next?")?.name).toBe("Pat");
  });

  it("matches 'did X say / push back / mention'", () => {
    expect(extractSpeakerHint("Did Sarah confirm the contract?")?.name).toBe("Sarah");
    expect(extractSpeakerHint("Did Bob push back on terms?")?.name).toBe("Bob");
    expect(extractSpeakerHint("Did Alex agree to the timeline?")?.name).toBe("Alex");
  });

  it("matches possessive forms", () => {
    expect(extractSpeakerHint("Tell me Sarah's objection.")?.name).toBe("Sarah");
    expect(extractSpeakerHint("What was John's view?")?.name).toBe("John");
    expect(extractSpeakerHint("Pat's reaction to the demo?")?.name).toBe("Pat");
  });

  it("matches 'according to X' / 'X said'", () => {
    expect(extractSpeakerHint("According to Sarah, budget is locked.")?.name).toBe("Sarah");
    expect(extractSpeakerHint("Sarah said the budget is locked.")?.name).toBe("Sarah");
    expect(extractSpeakerHint("John mentioned a competitor.")?.name).toBe("John");
  });

  it("higher confidence for verb-cue, lower for bare name", () => {
    const verb = extractSpeakerHint("What did Sarah say?")!;
    const bare = extractSpeakerHint("Sarah said hello.")!;
    expect(verb.confidence).toBeGreaterThan(bare.confidence);
  });
});

describe("extractSpeakerHint — null cases", () => {
  it("returns null for empty / whitespace input", () => {
    expect(extractSpeakerHint("")).toBeNull();
    expect(extractSpeakerHint("   ")).toBeNull();
  });

  it("returns null when no name appears", () => {
    expect(extractSpeakerHint("What's the timeline?")).toBeNull();
    expect(extractSpeakerHint("Did anyone confirm budget?")).toBeNull();
    expect(extractSpeakerHint("Was there an objection?")).toBeNull();
  });

  it("rejects pronouns and articles dressed as names", () => {
    expect(extractSpeakerHint("What did They say?")).toBeNull();
    expect(extractSpeakerHint("What did The team say?")).toBeNull();
    expect(extractSpeakerHint("What did We agree?")).toBeNull();
  });

  it("rejects domain words capitalised by mistake", () => {
    expect(extractSpeakerHint("What did Budget approve?")).toBeNull();
    expect(extractSpeakerHint("What did Q4 mean for us?")).toBeNull();
    expect(extractSpeakerHint("What did Monday's call cover?")).toBeNull();
  });

  it("ignores unrelated capitalised tokens with no verb cue nearby", () => {
    // "Acme" appears but no verb cue — falls through to the
    // bare-name pattern only when the verb sits adjacent.
    expect(extractSpeakerHint("How does Acme compare to others?")).toBeNull();
  });
});

describe("extractSpeakerHint — robustness", () => {
  it("returns the first matched name when several candidates appear", () => {
    const h = extractSpeakerHint(
      "What did Sarah say about Bob's earlier objection?",
    );
    expect(h?.name).toBe("Sarah");
  });

  it("preserves the matched startIndex + raw string for audit", () => {
    const h = extractSpeakerHint("So what did Sarah say next?");
    expect(h?.raw).toMatch(/Sarah/);
    expect(h?.startIndex).toBeGreaterThanOrEqual(0);
  });

  it("trims input before matching", () => {
    expect(extractSpeakerHint("   What did Sarah say?   ")?.name).toBe("Sarah");
  });

  it("respects the 30-char name length cap (rejects huge tokens)", () => {
    const longName = "A" + "b".repeat(40);
    expect(
      extractSpeakerHint(`What did ${longName} say about pricing?`),
    ).toBeNull();
  });
});

describe("speakerMatches", () => {
  const hint = {
    name: "Sarah",
    confidence: 0.9,
    startIndex: 0,
    raw: "What did Sarah say",
  };

  it("matches exact-case", () => {
    expect(speakerMatches("Sarah", hint)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(speakerMatches("sarah", hint)).toBe(true);
    expect(speakerMatches("SARAH", hint)).toBe(true);
  });

  it("matches first-name when chunk has full name", () => {
    expect(speakerMatches("Sarah Chen", hint)).toBe(true);
    expect(speakerMatches("Sarah O'Brien", hint)).toBe(true);
  });

  it("matches when hint has full name and chunk has first name", () => {
    const h2 = { ...hint, name: "Sarah Chen" };
    expect(speakerMatches("Sarah", h2)).toBe(true);
  });

  it("rejects different speakers", () => {
    expect(speakerMatches("Bob", hint)).toBe(false);
    expect(speakerMatches("Sarah-Marie", hint)).toBe(false);
  });

  it("returns false on null / empty inputs", () => {
    expect(speakerMatches(null, hint)).toBe(false);
    expect(speakerMatches(undefined, hint)).toBe(false);
    expect(speakerMatches("", hint)).toBe(false);
    expect(speakerMatches("Sarah", null)).toBe(false);
  });
});

describe("applySpeakerBias", () => {
  const hint = {
    name: "Sarah",
    confidence: 0.9,
    startIndex: 0,
    raw: "Sarah said",
  };

  it("returns input unchanged when hint is null", () => {
    const items = [
      { speaker: "Sarah", similarity: 0.5 },
      { speaker: "Bob", similarity: 0.6 },
    ];
    expect(applySpeakerBias(items, null)).toEqual(items);
  });

  it("returns input unchanged when items is empty", () => {
    expect(applySpeakerBias([], hint)).toEqual([]);
  });

  it("re-orders Sarah's chunk to top when hint matches", () => {
    const items = [
      { speaker: "Bob", similarity: 0.55 },
      { speaker: "Sarah", similarity: 0.5 }, // Sarah ranks lower by raw cosine
    ];
    const out = applySpeakerBias(items, hint);
    expect(out[0].speaker).toBe("Sarah");
    expect(out[1].speaker).toBe("Bob");
  });

  it("does NOT re-order when the gap exceeds the boost", () => {
    const items = [
      { speaker: "Bob", similarity: 0.7 },
      { speaker: "Sarah", similarity: 0.5 }, // gap 0.2 > boost 0.1
    ];
    const out = applySpeakerBias(items, hint);
    // Bob still wins because his cosine advantage is larger than the boost.
    expect(out[0].speaker).toBe("Bob");
  });

  it("preserves the original similarity value (boost is ranking-only)", () => {
    const items = [
      { speaker: "Bob", similarity: 0.55 },
      { speaker: "Sarah", similarity: 0.5 },
    ];
    const out = applySpeakerBias(items, hint);
    const sarahHit = out.find((c) => c.speaker === "Sarah");
    expect(sarahHit?.similarity).toBe(0.5); // not 0.6
  });

  it("is a stable re-rank (input order preserved within same boosted score)", () => {
    const items = [
      { speaker: "Bob", similarity: 0.5 },
      { speaker: "Pat", similarity: 0.5 },
      { speaker: "Sarah", similarity: 0.5 },
    ];
    // Sarah gets +0.1 → 0.6 → first.
    // Bob and Pat both stay at 0.5 → in their original input order.
    const out = applySpeakerBias(items, hint);
    expect(out.map((c) => c.speaker)).toEqual(["Sarah", "Bob", "Pat"]);
  });

  it("handles chunks with null speakers (no boost applied)", () => {
    const items = [
      { speaker: null, similarity: 0.6 },
      { speaker: "Sarah", similarity: 0.55 },
    ];
    const out = applySpeakerBias(items, hint);
    // Sarah 0.55 + 0.1 = 0.65 > unspeakered 0.6 → Sarah first.
    expect(out[0].speaker).toBe("Sarah");
  });

  it("does not mutate the input array", () => {
    const items = [
      { speaker: "Bob", similarity: 0.55 },
      { speaker: "Sarah", similarity: 0.5 },
    ];
    const before = items.map((i) => i.speaker);
    applySpeakerBias(items, hint);
    expect(items.map((i) => i.speaker)).toEqual(before);
  });

  it("SPEAKER_BIAS_BOOST is exported and is 0.1", () => {
    expect(SPEAKER_BIAS_BOOST).toBe(0.1);
  });
});
