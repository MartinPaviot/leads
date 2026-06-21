import { describe, it, expect } from "vitest";
import {
  extractDominantInsight,
  buildRejectionCounterPrompt,
  REJECTION_INSIGHT_FLOOR,
} from "@/lib/sequence-drafts/rejection-counter-prompt";

const cfg = (category: unknown, count: unknown) => ({
  rejectionInsights: { dominantInsight: { category, count } },
});

describe("extractDominantInsight", () => {
  it("returns the insight for a valid above-floor category", () => {
    expect(extractDominantInsight(cfg("tone", 4))).toEqual({ category: "tone", count: 4 });
  });

  it("null for null / missing rejectionInsights / missing dominantInsight", () => {
    expect(extractDominantInsight(null)).toBeNull();
    expect(extractDominantInsight({})).toBeNull();
    expect(extractDominantInsight({ rejectionInsights: {} })).toBeNull();
    expect(extractDominantInsight({ rejectionInsights: { dominantInsight: null } })).toBeNull();
  });

  it("null below the floor", () => {
    expect(extractDominantInsight(cfg("tone", REJECTION_INSIGHT_FLOOR - 1))).toBeNull();
  });

  it("null for non-numeric count / unknown category / 'other'", () => {
    expect(extractDominantInsight(cfg("tone", "4"))).toBeNull();
    expect(extractDominantInsight(cfg("gibberish", 9))).toBeNull();
    expect(extractDominantInsight(cfg("other", 9))).toBeNull();
  });

  it("accepts each of the 5 mapped categories", () => {
    for (const c of ["tone", "timing", "personalization", "trigger", "content"]) {
      expect(extractDominantInsight(cfg(c, 5))).toEqual({ category: c, count: 5 });
    }
  });
});

describe("buildRejectionCounterPrompt", () => {
  it("empty string for null", () => {
    expect(buildRejectionCounterPrompt(null)).toBe("");
  });

  it("emits a TOP PRIORITY block carrying the count for each category", () => {
    for (const c of ["tone", "timing", "personalization", "trigger", "content"] as const) {
      const out = buildRejectionCounterPrompt({ category: c, count: 7 });
      expect(out).toContain("FOUNDER FEEDBACK — TOP PRIORITY");
      expect(out).toContain("7 times");
      expect(out.length).toBeGreaterThan(40);
    }
  });
});
