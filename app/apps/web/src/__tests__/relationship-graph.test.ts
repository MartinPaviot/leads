import { describe, expect, it } from "vitest";
import {
  interactionsToConfidence,
  shouldEmitEdge,
  KNOWS,
} from "@/lib/relationship-graph";

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
