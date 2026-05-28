import { describe, expect, it } from "vitest";
import {
  KAIROS_FRESHNESS_WINDOW_MS,
  KAIROS_WEIGHT_THRESHOLD,
  NEUTRAL_FIT_SCORE,
  computeAccessibility,
  computePriorityScore,
  decideAcceleration,
  scoreContactReachability,
} from "@/lib/scoring/priority-score";

describe("computePriorityScore", () => {
  it("multiplies the three inputs straight when all are set", () => {
    // 2.0 × 0.8 × 0.6 = 0.96
    expect(
      computePriorityScore({
        signalMultiplier: 2.0,
        fitScore: 0.8,
        accessibility: 0.6,
      }),
    ).toBeCloseTo(0.96, 5);
  });

  it("falls back to NEUTRAL_FIT_SCORE when fitScore is null (no ICP scorer run yet)", () => {
    // 2.0 × 0.5 × 1.0 = 1.0
    expect(
      computePriorityScore({
        signalMultiplier: 2.0,
        fitScore: null,
        accessibility: 1.0,
      }),
    ).toBeCloseTo(1.0, 5);
    expect(NEUTRAL_FIT_SCORE).toBe(0.5);
  });

  it("returns 0 when accessibility is 0 (unreachable contact list wipes the score)", () => {
    expect(
      computePriorityScore({
        signalMultiplier: 2.5,
        fitScore: 1.0,
        accessibility: 0,
      }),
    ).toBe(0);
  });

  it("returns 0 when fit is 0 (anti-ICP-shaped company even with strong signal)", () => {
    expect(
      computePriorityScore({
        signalMultiplier: 2.5,
        fitScore: 0,
        accessibility: 1.0,
      }),
    ).toBe(0);
  });
});

describe("scoreContactReachability", () => {
  it("returns 1.0 when all three channels are present", () => {
    expect(
      scoreContactReachability({
        hasEmail: true,
        hasPhone: true,
        hasLinkedin: true,
      }),
    ).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for a contact with no channels", () => {
    expect(
      scoreContactReachability({
        hasEmail: false,
        hasPhone: false,
        hasLinkedin: false,
      }),
    ).toBe(0);
  });

  it("weights email at 0.4", () => {
    expect(
      scoreContactReachability({
        hasEmail: true,
        hasPhone: false,
        hasLinkedin: false,
      }),
    ).toBe(0.4);
  });

  it("weights phone equal to email (cold call channel is real)", () => {
    expect(
      scoreContactReachability({
        hasEmail: false,
        hasPhone: true,
        hasLinkedin: false,
      }),
    ).toBe(0.4);
  });

  it("weights LinkedIn lower than email/phone (slower-cycle channel)", () => {
    expect(
      scoreContactReachability({
        hasEmail: false,
        hasPhone: false,
        hasLinkedin: true,
      }),
    ).toBe(0.2);
  });
});

describe("computeAccessibility", () => {
  it("returns 0 for an empty contact list (company unreachable)", () => {
    expect(computeAccessibility([])).toBe(0);
  });

  it("picks the most reachable contact, not the average", () => {
    expect(
      computeAccessibility([
        { hasEmail: false, hasPhone: false, hasLinkedin: false },
        { hasEmail: true, hasPhone: true, hasLinkedin: true },
        { hasEmail: false, hasPhone: false, hasLinkedin: false },
      ]),
    ).toBeCloseTo(1.0, 5);
  });

  it("returns the single-contact score when there's only one", () => {
    expect(
      computeAccessibility([
        { hasEmail: true, hasPhone: false, hasLinkedin: true },
      ]),
    ).toBeCloseTo(0.6, 5);
  });
});

describe("decideAcceleration — kairos accelerator", () => {
  const now = new Date("2026-05-28T12:00:00Z");

  it("bumps a fresh high-weight signal on an active enrollment with a future step", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-28T10:00:00Z"), // 2h old
        signalMultiplier: 2.0,
        enrollmentStatus: "active",
        enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
        now,
      }),
    ).toEqual({
      shouldBump: true,
      reason: "fresh_high_weight_signal",
    });
  });

  it("refuses to bump a replied enrollment (stop-on-reply must hold)", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-28T10:00:00Z"),
        signalMultiplier: 2.0,
        enrollmentStatus: "replied",
        enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
        now,
      }),
    ).toEqual({
      shouldBump: false,
      reason: "enrollment_not_active",
    });
  });

  it("refuses to bump a paused or completed or bounced enrollment", () => {
    for (const status of ["paused", "completed", "bounced", "unsubscribed"] as const) {
      expect(
        decideAcceleration({
          signalFiredAt: new Date("2026-05-28T10:00:00Z"),
          signalMultiplier: 2.0,
          enrollmentStatus: status,
          enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
          now,
        }).shouldBump,
      ).toBe(false);
    }
  });

  it("refuses to bump on a stale signal (> 24h old)", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-26T10:00:00Z"), // 50h old
        signalMultiplier: 2.0,
        enrollmentStatus: "active",
        enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
        now,
      }),
    ).toEqual({
      shouldBump: false,
      reason: "signal_stale",
    });
  });

  it("accepts a signal exactly at the freshness boundary (24h-1ms old)", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date(
          now.getTime() - (KAIROS_FRESHNESS_WINDOW_MS - 1),
        ),
        signalMultiplier: 2.0,
        enrollmentStatus: "active",
        enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
        now,
      }).shouldBump,
    ).toBe(true);
  });

  it("refuses to bump when signal weight is below the 1.5× threshold", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-28T10:00:00Z"),
        signalMultiplier: 1.2,
        enrollmentStatus: "active",
        enrollmentNextStepAt: new Date("2026-05-30T09:00:00Z"),
        now,
      }),
    ).toEqual({
      shouldBump: false,
      reason: "weight_below_threshold",
    });
    expect(KAIROS_WEIGHT_THRESHOLD).toBe(1.5);
  });

  it("refuses to bump when there is no next step scheduled (enrollment idle)", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-28T10:00:00Z"),
        signalMultiplier: 2.0,
        enrollmentStatus: "active",
        enrollmentNextStepAt: null,
        now,
      }),
    ).toEqual({
      shouldBump: false,
      reason: "no_next_step_scheduled",
    });
  });

  it("refuses to bump when next step is already due (cadence cron will fire it)", () => {
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-28T10:00:00Z"),
        signalMultiplier: 2.0,
        enrollmentStatus: "active",
        enrollmentNextStepAt: new Date("2026-05-28T11:00:00Z"), // 1h ago
        now,
      }),
    ).toEqual({
      shouldBump: false,
      reason: "already_due",
    });
  });

  it("prioritises 'enrollment_not_active' over signal staleness checks", () => {
    // A replied enrollment with a stale signal — we surface the
    // replied status, not the stale flag, because the replied state
    // is the load-bearing guardrail.
    expect(
      decideAcceleration({
        signalFiredAt: new Date("2026-05-20T10:00:00Z"), // very stale
        signalMultiplier: 0.7, // weak
        enrollmentStatus: "replied",
        enrollmentNextStepAt: null,
        now,
      }).reason,
    ).toBe("enrollment_not_active");
  });
});
