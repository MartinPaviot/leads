import { describe, it, expect } from "vitest";
import {
  shouldDraftNudge,
  isNudgeStale,
  computeNudgeExpiresAt,
  escalationGuidance,
} from "../followup-nudge";
import type { FollowupDue } from "../followup-due";

const due = (over: Partial<FollowupDue> = {}): FollowupDue => ({
  dueAt: 1000,
  stage: 1,
  overdue: true,
  daysUntilDue: 0,
  businessDaysOverdue: 0,
  ...over,
});

const notDue: FollowupDue = { dueAt: null, stage: 0, overdue: false, daysUntilDue: 5, businessDaysOverdue: 0 };

describe("shouldDraftNudge", () => {
  it("drafts when due and no existing row for this stage", () => {
    expect(shouldDraftNudge(due({ stage: 1 }), [])).toBe(true);
  });
  it("does NOT draft when not due at all", () => {
    expect(shouldDraftNudge(notDue, [])).toBe(false);
  });
  it("does NOT draft when not yet due (upcoming, not overdue/today)", () => {
    expect(shouldDraftNudge(due({ stage: 1, overdue: false, daysUntilDue: 2 }), [])).toBe(false);
  });
  it("does NOT re-draft a stage that already has ANY row (pending, sent, dismissed, or expired)", () => {
    const rows = [{ conversationKey: "k1", stage: 1 }];
    expect(shouldDraftNudge(due({ stage: 1 }), rows)).toBe(false);
  });
  it("DOES draft a later stage even when an earlier stage already has a row", () => {
    const rows = [{ conversationKey: "k1", stage: 1 }];
    expect(shouldDraftNudge(due({ stage: 2 }), rows)).toBe(true);
  });
  it("null/undefined followup never drafts", () => {
    expect(shouldDraftNudge(null, [])).toBe(false);
    expect(shouldDraftNudge(undefined, [])).toBe(false);
  });
});

describe("isNudgeStale", () => {
  it("a pending draft is stale once the thread is no longer due at all (e.g. they replied)", () => {
    expect(isNudgeStale(1, notDue)).toBe(true);
  });
  it("a pending draft is stale once the LIVE stage has moved past the draft's stage", () => {
    // drafted for stage 1, but the thread is now live-computed at stage 2
    // (e.g. another nudge path advanced it) — the stage-1 draft no longer matches reality.
    expect(isNudgeStale(1, due({ stage: 2 }))).toBe(true);
  });
  it("a pending draft is NOT stale while the live state still matches its stage", () => {
    expect(isNudgeStale(1, due({ stage: 1 }))).toBe(false);
  });
  it("null/undefined live followup is treated as stale (fail toward clearing, not lingering)", () => {
    expect(isNudgeStale(1, null)).toBe(true);
    expect(isNudgeStale(1, undefined)).toBe(true);
  });
});

describe("computeNudgeExpiresAt", () => {
  it("defaults to 5 days from generation", () => {
    const gen = Date.UTC(2026, 0, 1);
    const exp = computeNudgeExpiresAt(gen);
    expect(exp.getTime() - gen).toBe(5 * 86_400_000);
  });
  it("respects a custom day count", () => {
    const gen = Date.UTC(2026, 0, 1);
    const exp = computeNudgeExpiresAt(gen, 2);
    expect(exp.getTime() - gen).toBe(2 * 86_400_000);
  });
});

describe("escalationGuidance", () => {
  it("stage 1 reads as gentle/low-pressure (matches today's single-template tone)", () => {
    expect(escalationGuidance(1)).toMatch(/light|low-pressure/i);
  });
  it("stage 2 asks for more directness than stage 1, while staying warm", () => {
    const g1 = escalationGuidance(1);
    const g2 = escalationGuidance(2);
    expect(g2).not.toBe(g1);
    expect(g2).toMatch(/more direct/i);
  });
  it("stage 3+ asks for a clear close-the-loop ask, never urgency/guilt", () => {
    const g3 = escalationGuidance(3);
    expect(g3).toMatch(/direct/i);
    expect(g3).toMatch(/do not guilt-trip|do not.*urgency/i);
  });
  it("every stage's guidance mentions no fabrication is reiterated by the caller, not duplicated here — guidance is tone-only", () => {
    // Smoke check: none of the guidance strings invent a deadline/price/commitment word.
    for (const s of [1, 2, 3, 4]) {
      expect(escalationGuidance(s)).not.toMatch(/\$|discount|deadline|expires? (today|tomorrow)/i);
    }
  });
});
