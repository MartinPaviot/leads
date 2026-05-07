import { describe, it, expect } from "vitest";
import {
  classifyRejection,
  aggregateRejections,
  dominantInsight,
} from "@/lib/sequence-drafts/rejection-classifier";

describe("classifyRejection", () => {
  it("returns 'other' for empty / whitespace input", () => {
    expect(classifyRejection("").category).toBe("other");
    expect(classifyRejection("   ").category).toBe("other");
    expect(classifyRejection("").confidence).toBe(0);
  });

  it("classifies tone-related rejections", () => {
    const cases = [
      "Tone is too aggressive",
      "Soften the tone before sending",
      "Too pushy for an exec",
      "Way too direct, sounds harsh",
      "Tone is informal — needs to be formal",
    ];
    for (const c of cases) {
      const result = classifyRejection(c);
      expect(result.category).toBe("tone");
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  it("classifies timing-related rejections", () => {
    const cases = [
      "Wrong moment, recipient just signed with competitor",
      "Bad timing — they're in a board meeting",
      "Recipient out of office, hold off",
      "Reaching out too soon after the last touch",
      "Recipient signed with a competitor last week",
    ];
    for (const c of cases) {
      expect(classifyRejection(c).category).toBe("timing");
    }
  });

  it("classifies personalization rejections", () => {
    const cases = [
      "Too generic, no personalization",
      "Wrong company name — feels copy-paste",
      "Personalisation is shallow, missing context",
      "Boilerplate phrasing throughout",
      "Reads templated",
    ];
    for (const c of cases) {
      expect(classifyRejection(c).category).toBe("personalization");
    }
  });

  it("classifies trigger-related rejections", () => {
    const cases = [
      "Triggered on outdated signal",
      "Wrong signal — they already replied yesterday",
      "False positive trigger",
      "Stale signal, info is from 6 months ago",
    ];
    for (const c of cases) {
      expect(classifyRejection(c).category).toBe("trigger");
    }
  });

  it("classifies content-related rejections", () => {
    const cases = [
      "Broken link in step 2",
      "Spelling mistakes",
      "Factually incorrect",
      "Unprofessional copy",
      "Off-topic, doesn't address their use case",
    ];
    for (const c of cases) {
      expect(classifyRejection(c).category).toBe("content");
    }
  });

  it("falls back to 'other' on unmatched text", () => {
    const result = classifyRejection("xyz unrelated phrase blob");
    expect(result.category).toBe("other");
    expect(result.confidence).toBe(0);
  });

  it("returns matched signals for audit", () => {
    const result = classifyRejection("Way too pushy and aggressive tone");
    expect(result.category).toBe("tone");
    expect(result.matchedSignals.length).toBeGreaterThan(1);
  });

  it("confidence is bounded [0, 1]", () => {
    for (const reason of [
      "tone aggressive pushy too direct soften harsh informal casual abrasive",
      "outdated signal trigger",
      "broken link typo grammar",
      "",
      "no match here",
    ]) {
      const c = classifyRejection(reason).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("aggregateRejections", () => {
  it("returns zeros when input is empty", () => {
    expect(aggregateRejections([])).toEqual({
      tone: 0,
      timing: 0,
      personalization: 0,
      trigger: 0,
      content: 0,
      other: 0,
    });
  });

  it("counts each category", () => {
    const counts = aggregateRejections([
      classifyRejection("Tone is aggressive"),
      classifyRejection("Tone too pushy"),
      classifyRejection("Wrong moment, signed competitor"),
      classifyRejection("xyz"),
    ]);
    expect(counts.tone).toBe(2);
    expect(counts.timing).toBe(1);
    expect(counts.other).toBe(1);
  });
});

describe("dominantInsight", () => {
  it("returns null when no category crosses threshold", () => {
    expect(
      dominantInsight({
        tone: 2,
        timing: 1,
        personalization: 0,
        trigger: 0,
        content: 0,
        other: 5,
      }),
    ).toBeNull();
  });

  it("returns the dominant category when a bin reaches threshold", () => {
    const insight = dominantInsight({
      tone: 4,
      timing: 1,
      personalization: 2,
      trigger: 0,
      content: 0,
      other: 0,
    });
    expect(insight).toEqual({ category: "tone", count: 4 });
  });

  it("never returns 'other' even if it dominates", () => {
    expect(
      dominantInsight({
        tone: 0,
        timing: 0,
        personalization: 0,
        trigger: 0,
        content: 0,
        other: 10,
      }),
    ).toBeNull();
  });

  it("respects custom threshold", () => {
    expect(
      dominantInsight(
        {
          tone: 2,
          timing: 0,
          personalization: 0,
          trigger: 0,
          content: 0,
          other: 0,
        },
        2,
      ),
    ).toEqual({ category: "tone", count: 2 });
  });

  it("breaks ties in favour of higher count", () => {
    const insight = dominantInsight({
      tone: 3,
      timing: 5,
      personalization: 0,
      trigger: 0,
      content: 0,
      other: 0,
    });
    expect(insight).toEqual({ category: "timing", count: 5 });
  });
});
