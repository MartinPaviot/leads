import { describe, expect, it } from "vitest";
import {
  computeMultiplier,
  listKnownSignalTypes,
  priorMultiplier,
  SIGNAL_PRIORS,
} from "@/lib/scoring/signal-outcomes";

describe("signal-outcomes math", () => {
  describe("computeMultiplier", () => {
    it("returns neutral 1.0 when sample size is below threshold (tenant too young)", () => {
      // Even a 9-0 early streak shouldn't swing the weight.
      expect(computeMultiplier({ wonWithSignal: 9, lostWithSignal: 0, baselineWinRate: 0.3 })).toBe(1);
      expect(computeMultiplier({ wonWithSignal: 0, lostWithSignal: 9, baselineWinRate: 0.3 })).toBe(1);
    });

    it("returns 1.0 on degenerate baseline (no history yet)", () => {
      expect(computeMultiplier({ wonWithSignal: 10, lostWithSignal: 10, baselineWinRate: 0 })).toBe(1);
      expect(computeMultiplier({ wonWithSignal: 10, lostWithSignal: 10, baselineWinRate: 1 })).toBe(1);
    });

    it("reports >1 multiplier when a signal wins above baseline", () => {
      // Signal observed on 20 deals, 15 won → 75% vs 30% baseline = 2.5× lift
      const m = computeMultiplier({ wonWithSignal: 15, lostWithSignal: 5, baselineWinRate: 0.3 });
      expect(m).toBeGreaterThan(1);
      // Clamped at 2.5×.
      expect(m).toBeLessThanOrEqual(2.5);
    });

    it("reports <1 multiplier when a signal wins below baseline", () => {
      // Signal observed on 20 deals, only 2 won → 10% vs 50% baseline = 0.2× lift
      const m = computeMultiplier({ wonWithSignal: 2, lostWithSignal: 18, baselineWinRate: 0.5 });
      expect(m).toBeLessThan(1);
      // Clamped at 0.5×.
      expect(m).toBeGreaterThanOrEqual(0.5);
    });

    it("caps at MAX_MULTIPLIER so a lopsided streak can't zero out scoring math", () => {
      const m = computeMultiplier({ wonWithSignal: 100, lostWithSignal: 0, baselineWinRate: 0.1 });
      expect(m).toBe(2.5);
    });

    it("floors at MIN_MULTIPLIER so a few losses don't declare a signal worthless", () => {
      const m = computeMultiplier({ wonWithSignal: 0, lostWithSignal: 100, baselineWinRate: 0.5 });
      expect(m).toBe(0.5);
    });

    it("returns exactly 1.0 when observed rate equals baseline (useful signal, no lift)", () => {
      const m = computeMultiplier({ wonWithSignal: 15, lostWithSignal: 15, baselineWinRate: 0.5 });
      expect(m).toBeCloseTo(1, 5);
    });
  });

  describe("priorMultiplier — informed default before outcome data exists", () => {
    it("lifts engagement signals above neutral so a fresh reply ranks before any deal closes", () => {
      expect(priorMultiplier("positive_reply")).toBeGreaterThan(1);
      expect(priorMultiplier("meeting_booked")).toBeGreaterThan(1);
      expect(priorMultiplier("linkedin_reply")).toBeGreaterThan(1);
    });

    it("lifts warm-network proximity (the free cold-TAM differentiator)", () => {
      expect(priorMultiplier("warm_connection")).toBeGreaterThan(1);
      expect(priorMultiplier("warm_connection")).toBe(SIGNAL_PRIORS.warm_connection);
    });

    it("orders a reply above a mere open (stronger engagement = stronger prior)", () => {
      expect(priorMultiplier("positive_reply")).toBeGreaterThan(priorMultiplier("email_opened"));
    });

    it("returns neutral 1.0 for an unknown signal type", () => {
      expect(priorMultiplier("totally_unknown_signal")).toBe(1);
    });

    it("never exceeds the multiplier band even if a prior is set high", () => {
      for (const type of Object.keys(SIGNAL_PRIORS)) {
        const m = priorMultiplier(type);
        expect(m).toBeGreaterThanOrEqual(0.5);
        expect(m).toBeLessThanOrEqual(2.5);
      }
    });
  });

  describe("listKnownSignalTypes", () => {
    it("exposes the six shipped signal detectors", () => {
      const types = listKnownSignalTypes();
      expect(types).toContain("funding");
      expect(types).toContain("funding_crunchbase");
      expect(types).toContain("hiring");
      expect(types).toContain("tech_stack_change");
      expect(types).toContain("leadership_change");
      expect(types).toContain("investor_overlap");
    });
  });
});
