import { describe, expect, it } from "vitest";
import {
  interactionsToConfidence,
  shouldEmitEdge,
  KNOWS,
  LINKEDIN_CONNECTION_CONFIDENCE,
  linkedinConnectionConfidence,
  matchRelationToContactId,
  fuseKnowsConfidence,
} from "@/lib/context/relationship-graph";

describe("relationship-graph pure helpers", () => {
  describe("shouldEmitEdge", () => {
    it("rejects single-interaction pairs (spam / bounced emails)", () => {
      expect(shouldEmitEdge(0)).toBe(false);
      expect(shouldEmitEdge(1)).toBe(false);
    });

    it("admits pairs with ≥2 interactions", () => {
      expect(shouldEmitEdge(2)).toBe(true);
      expect(shouldEmitEdge(10)).toBe(true);
      expect(shouldEmitEdge(10_000)).toBe(true);
    });
  });

  describe("interactionsToConfidence", () => {
    it("returns 0 when there's nothing to learn from", () => {
      expect(interactionsToConfidence(0)).toBe(0);
      expect(interactionsToConfidence(1)).toBe(0);
    });

    it("is monotonically non-decreasing", () => {
      let prev = interactionsToConfidence(2);
      for (let n = 3; n <= 500; n++) {
        const next = interactionsToConfidence(n);
        expect(next).toBeGreaterThanOrEqual(prev);
        prev = next;
      }
    });

    it("assigns a small but non-zero confidence at the 2-interaction floor", () => {
      const c = interactionsToConfidence(2);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(0.4);
    });

    it("saturates below 1.0 even at extreme frequency (frequency is a strong prior, not certainty)", () => {
      expect(interactionsToConfidence(1_000)).toBeLessThan(1);
      expect(interactionsToConfidence(100_000)).toBeLessThan(1);
      expect(interactionsToConfidence(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(0.95);
    });

    it("orders pairs sensibly across typical founder-led volumes", () => {
      // A founder emails a hot champion ~30 times in the sales cycle;
      // a cold prospect maybe 3. The champion must score higher.
      expect(interactionsToConfidence(30)).toBeGreaterThan(interactionsToConfidence(3));
      // And a steady contact (5-10) should score higher than a one-
      // shot reply thread (2).
      expect(interactionsToConfidence(7)).toBeGreaterThan(interactionsToConfidence(2));
    });

    it("matches the documented reference points (docs should stay honest)", () => {
      expect(interactionsToConfidence(2)).toBeCloseTo(Math.log10(3) / 2.2, 3);
      expect(interactionsToConfidence(5)).toBeCloseTo(Math.log10(6) / 2.2, 3);
      expect(interactionsToConfidence(20)).toBeCloseTo(Math.log10(21) / 2.2, 3);
    });
  });

  describe("KNOWS constant", () => {
    it("uses the uppercase relation-type convention shared with other edges (WORKS_AT, DISCUSSED, ...)", () => {
      expect(KNOWS).toBe("KNOWS");
    });
  });
});

describe("LinkedIn connections (spec 36, T9)", () => {
  it("a 1st-degree connection is a fixed structural prior (0.80), not a frequency", () => {
    expect(LINKEDIN_CONNECTION_CONFIDENCE).toBe(0.8);
    expect(linkedinConnectionConfidence()).toBe(0.8);
    // Stronger than a 2-message email tie, weaker than the 0.95 frequency ceiling.
    expect(LINKEDIN_CONNECTION_CONFIDENCE).toBeGreaterThan(interactionsToConfidence(2));
    expect(LINKEDIN_CONNECTION_CONFIDENCE).toBeLessThan(0.95);
  });

  it("bumps to 0.85 when the relation shows a recent interaction", () => {
    expect(linkedinConnectionConfidence({ recentInteraction: true })).toBe(0.85);
    expect(linkedinConnectionConfidence({ recentInteraction: false })).toBe(0.8);
  });

  describe("fuseKnowsConfidence — multi-channel corroboration (no clobber)", () => {
    it("a single channel keeps its own confidence", () => {
      expect(fuseKnowsConfidence({ email: 0.72 })).toBeCloseTo(0.72, 5);
      expect(fuseKnowsConfidence({ linkedin: 0.8 })).toBeCloseTo(0.8, 5);
    });
    it("two channels score HIGHER than either alone (base + 0.05 bonus)", () => {
      const fused = fuseKnowsConfidence({ email: 0.85, linkedin: 0.8 });
      expect(fused).toBeCloseTo(0.9, 5);
      expect(fused).toBeGreaterThan(0.85); // never a downgrade
      expect(fused).toBeGreaterThan(0.8);
    });
    it("never exceeds the 0.95 ceiling", () => {
      expect(fuseKnowsConfidence({ email: 0.95, linkedin: 0.8, meeting: 0.9 })).toBe(0.95);
    });
    it("ignores zero/empty channels; empty map → 0", () => {
      expect(fuseKnowsConfidence({})).toBe(0);
      expect(fuseKnowsConfidence({ email: 0, linkedin: 0.8 })).toBeCloseTo(0.8, 5);
    });
  });

  describe("matchRelationToContactId — normalizes via linkedinPath", () => {
    const byPath = new Map<string, string>([["linkedin.com/in/jane-doe", "contact-jane"]]);

    it("matches across scheme / www / case / trailing slash differences", () => {
      expect(matchRelationToContactId("https://www.LinkedIn.com/in/jane-doe/", byPath)).toBe("contact-jane");
      expect(matchRelationToContactId("linkedin.com/in/jane-doe", byPath)).toBe("contact-jane");
    });

    it("returns null for an unknown profile or a missing url", () => {
      expect(matchRelationToContactId("https://linkedin.com/in/someone-else", byPath)).toBeNull();
      expect(matchRelationToContactId(null, byPath)).toBeNull();
      expect(matchRelationToContactId("", byPath)).toBeNull();
    });
  });
});
