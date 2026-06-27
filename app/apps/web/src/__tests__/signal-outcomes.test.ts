import { describe, expect, it } from "vitest";
import {
  computeMultiplier,
  inheritAliasMultipliers,
  listKnownSignalTypes,
  priorMultiplier,
  SIGNAL_CANONICAL_ALIAS,
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

    it("lifts the signal-monitor news/jobs types so they aren't dead at 1.0× before any deal", () => {
      // inngest/signal-monitor.ts writes these straight into properties.signals[];
      // a missing prior left them undefined → floored 1.0× on the daily score.
      for (const type of ["acquisition", "hiring_surge", "executive_hire"]) {
        expect(priorMultiplier(type)).toBeGreaterThan(1);
      }
      // A raise/M&A and a hiring surge outrank a single exec hire.
      expect(priorMultiplier("acquisition")).toBeGreaterThanOrEqual(priorMultiplier("hiring_surge"));
      expect(priorMultiplier("hiring_surge")).toBeGreaterThanOrEqual(priorMultiplier("executive_hire"));
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

  describe("inheritAliasMultipliers — producer aliases inherit the LEARNED family lift", () => {
    it("maps each producer variant onto the detector family that accrues its outcomes", () => {
      // The monitors write producer-taxonomy types into properties.signals[];
      // outcomes are keyed by the detector taxonomy. Without these the learned
      // lift never reaches the variant the monitors actually write.
      expect(SIGNAL_CANONICAL_ALIAS.funding_recent).toBe("funding");
      expect(SIGNAL_CANONICAL_ALIAS.hiring_surge).toBe("hiring");
      expect(SIGNAL_CANONICAL_ALIAS.executive_hire).toBe("leadership_change");
      // acquisition + warm_connection have no detector counterpart → never aliased.
      expect(SIGNAL_CANONICAL_ALIAS.acquisition).toBeUndefined();
      expect(SIGNAL_CANONICAL_ALIAS.warm_connection).toBeUndefined();
    });

    it("copies the learned funding multiplier onto funding_recent when funding cleared the sample threshold", () => {
      const multipliers = { funding: 2.2, funding_recent: 1.6 };
      inheritAliasMultipliers(multipliers, new Set(["funding"]));
      // The learned 2.2× now reaches the recent-raise variant (was stuck at 1.6 prior).
      expect(multipliers.funding_recent).toBe(2.2);
    });

    it("transfers the learned lift across every alias family at once", () => {
      const multipliers = {
        funding: 2.2, funding_recent: 1.6,
        hiring: 0.7, hiring_surge: 1.5,
        leadership_change: 1.9, executive_hire: 1.4,
      };
      inheritAliasMultipliers(multipliers, new Set(["funding", "hiring", "leadership_change"]));
      expect(multipliers.funding_recent).toBe(2.2);
      expect(multipliers.hiring_surge).toBe(0.7); // even a learned DOWN-weight transfers
      expect(multipliers.executive_hire).toBe(1.9);
    });

    it("keeps the alias's own prior when the canonical family is NOT learned (no real data yet)", () => {
      const multipliers = { funding: 1.5, funding_recent: 1.6 };
      // `funding` absent from learnedTypes → still on its prior → do NOT clobber
      // funding_recent's stronger prior with another prior.
      inheritAliasMultipliers(multipliers, new Set());
      expect(multipliers.funding_recent).toBe(1.6);
    });

    it("does not invent an alias entry when the canonical multiplier is missing", () => {
      const multipliers: Record<string, number> = { funding_recent: 1.6 };
      inheritAliasMultipliers(multipliers, new Set(["funding"]));
      expect(multipliers.funding_recent).toBe(1.6);
      expect("funding" in multipliers).toBe(false);
    });

    it("returns the same map it mutates (chainable)", () => {
      const multipliers = { funding: 2.0, funding_recent: 1.6 };
      expect(inheritAliasMultipliers(multipliers, new Set(["funding"]))).toBe(multipliers);
    });
  });
});
