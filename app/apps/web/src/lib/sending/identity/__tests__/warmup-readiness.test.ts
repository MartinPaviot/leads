import { describe, it, expect } from "vitest";
import {
  evaluateWarmupReadiness,
  allowedColdSendsToday,
  signalFromAnalytics,
  WARMUP_STATUS,
  DEFAULT_MIN_WARMUP_SCORE,
  type WarmupSignal,
} from "../warmup-readiness";
import { getWarmupDailyTarget, isWarmupComplete } from "@/lib/campaign-engine/deliverability/warmup";

const active = (over: Partial<WarmupSignal> = {}): WarmupSignal => ({ status: WARMUP_STATUS.active, score: 95, ...over });
const DAY = 24 * 60 * 60 * 1000;

describe("evaluateWarmupReadiness — unhealthy statuses fail closed regardless of score", () => {
  it("banned / spam / suspended / paused each block with their code, even at score 100", () => {
    expect(evaluateWarmupReadiness({ status: WARMUP_STATUS.banned, score: 100 })).toMatchObject({ canSendCold: false, code: "warmup_banned" });
    expect(evaluateWarmupReadiness({ status: WARMUP_STATUS.spamFolder, score: 100 })).toMatchObject({ canSendCold: false, code: "warmup_in_spam" });
    expect(evaluateWarmupReadiness({ status: WARMUP_STATUS.suspended, score: 100 })).toMatchObject({ canSendCold: false, code: "warmup_suspended" });
    expect(evaluateWarmupReadiness({ status: WARMUP_STATUS.paused, score: 100 })).toMatchObject({ canSendCold: false, code: "warmup_paused" });
  });

  it("an unknown status code fails closed", () => {
    expect(evaluateWarmupReadiness({ status: 99, score: 100 })).toMatchObject({ canSendCold: false, code: "warmup_unknown_status" });
  });
});

describe("evaluateWarmupReadiness — active gates on score then inbox rate", () => {
  it("active + score >= floor → can send cold", () => {
    expect(evaluateWarmupReadiness(active({ score: DEFAULT_MIN_WARMUP_SCORE }))).toEqual({ canSendCold: true, reason: expect.stringContaining("90") });
  });

  it("active + score below floor → immature", () => {
    expect(evaluateWarmupReadiness(active({ score: 80 }))).toMatchObject({ canSendCold: false, code: "warmup_immature" });
  });

  it("a NaN score fails closed (not a silent pass)", () => {
    expect(evaluateWarmupReadiness(active({ score: Number.NaN }))).toMatchObject({ canSendCold: false, code: "warmup_immature" });
  });

  it("active + good score but inbox rate below floor → low_inbox_rate", () => {
    expect(evaluateWarmupReadiness(active({ score: 95, inboxRate: 0.8 }))).toMatchObject({ canSendCold: false, code: "warmup_low_inbox_rate" });
  });

  it("active + good score + good inbox rate → can send cold", () => {
    expect(evaluateWarmupReadiness(active({ score: 95, inboxRate: 0.95 })).canSendCold).toBe(true);
  });

  it("inboxRate is only gated when present (null → score-only)", () => {
    expect(evaluateWarmupReadiness(active({ score: 95, inboxRate: null })).canSendCold).toBe(true);
  });

  it("config overrides the floors", () => {
    expect(evaluateWarmupReadiness(active({ score: 80 }), { minScore: 70 }).canSendCold).toBe(true);
    expect(evaluateWarmupReadiness(active({ score: 95, inboxRate: 0.8 }), { minInboxRate: 0.7 }).canSendCold).toBe(true);
  });
});

describe("allowedColdSendsToday — gate then ramp ceiling minus sent", () => {
  it("a blocked gate yields 0 cold sends no matter the cap", () => {
    const r = allowedColdSendsToday({ signal: { status: WARMUP_STATUS.spamFolder, score: 100 }, warmupStartedAt: null, steadyDailyCap: 50, sentToday: 0 });
    expect(r.allowed).toBe(0);
    expect(r.gate.canSendCold).toBe(false);
  });

  it("warmed (null start) → steady cap minus already-sent", () => {
    expect(allowedColdSendsToday({ signal: active(), warmupStartedAt: null, steadyDailyCap: 50, sentToday: 10 }).allowed).toBe(40);
  });

  it("ramp complete (long ago) → full steady cap", () => {
    const longAgo = new Date(Date.now() - 365 * DAY);
    expect(isWarmupComplete(longAgo)).toBe(true);
    expect(allowedColdSendsToday({ signal: active(), warmupStartedAt: longAgo, steadyDailyCap: 50, sentToday: 0 }).allowed).toBe(50);
  });

  it("mid-ramp → the ramp target, capped, and below the steady cap", () => {
    const fresh = new Date(Date.now() - 1 * DAY); // ~day 1-2 of the schedule
    const expectedCeiling = isWarmupComplete(fresh) ? 50 : Math.min(getWarmupDailyTarget(fresh), 50);
    const { allowed } = allowedColdSendsToday({ signal: active(), warmupStartedAt: fresh, steadyDailyCap: 50, sentToday: 0 });
    expect(allowed).toBe(expectedCeiling);
    expect(allowed).toBeLessThan(50); // the ramp is actually constraining, not the steady cap
    expect(allowed).toBeGreaterThan(0);
  });
});

describe("signalFromAnalytics — derive the signal from the warmup-analytics aggregate", () => {
  it("computes inboxRate = landed_inbox / sent and carries the health score", () => {
    expect(signalFromAnalytics({ health_score: 87, sent: 20, landed_inbox: 18 }, WARMUP_STATUS.active)).toEqual({ status: 1, score: 87, inboxRate: 0.9 });
  });

  it("no sends → inboxRate null (score-only gate), missing score → 0 (fails closed)", () => {
    expect(signalFromAnalytics({ sent: 0 }, WARMUP_STATUS.active)).toEqual({ status: 1, score: 0, inboxRate: null });
    expect(signalFromAnalytics(undefined, WARMUP_STATUS.paused)).toEqual({ status: 0, score: 0, inboxRate: null });
  });
});
