/**
 * Sequence-drafts state-machine integration test (P0-1 task 1.7).
 *
 * The approve / reject / edit / expire flows are encoded across :
 *  - `lib/sequence-drafts/state-machine.ts` (pure transition logic)
 *  - 3 API routes that wrap atomic UPDATE-WHERE-version queries
 *  - `lib/sequence-drafts/expiry.ts` (expiry decider)
 *
 * The DB layer is the same Postgres in dev / prod ; we don't have a
 * test harness here, so this suite drives the pure pieces hard
 * enough to prove the full lifecycle is sound. Race semantics
 * (version stamping, concurrent approve, expire-then-approve) are
 * exercised against the in-memory machine.
 *
 * What's covered :
 *  1. Lifecycle order — pending → approved/rejected/expired/sent
 *  2. Terminal states reject all further mutations
 *  3. Optimistic-lock outcomes (advance version)
 *  4. Expire predicate respects status guard
 *  5. Reject-rejection-learner round trip
 */

import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, validateRejectionReason } from "@/lib/sequence-drafts/state-machine";
import { shouldExpire, expiryCutoff } from "@/lib/sequence-drafts/expiry";
import { classifyRejection, aggregateRejections, dominantInsight } from "@/lib/sequence-drafts/rejection-classifier";
import { decideRouteMode, buildDraftRow } from "@/lib/sequence-drafts/router";

describe("flow: pending → approved", () => {
  it("approve transition is allowed from pending", () => {
    expect(canTransition("pending_approval", "approve").allowed).toBe(true);
  });

  it("approved is non-terminal but rejects further approve", () => {
    expect(isTerminal("approved")).toBe(false);
    expect(canTransition("approved", "approve").allowed).toBe(false);
  });

  it("approved → sent transitions on send worker", () => {
    expect(canTransition("approved", "mark_sent").allowed).toBe(true);
    expect(isTerminal("sent")).toBe(true);
    expect(canTransition("sent", "approve").allowed).toBe(false);
    expect(canTransition("sent", "reject").allowed).toBe(false);
    expect(canTransition("sent", "edit").allowed).toBe(false);
  });

  it("expire is rejected on already-approved drafts", () => {
    expect(canTransition("approved", "expire").allowed).toBe(false);
  });
});

describe("flow: pending → rejected", () => {
  it("reject transition is allowed from pending only", () => {
    expect(canTransition("pending_approval", "reject").allowed).toBe(true);
    expect(canTransition("approved", "reject").allowed).toBe(false);
    expect(canTransition("rejected", "reject").allowed).toBe(false);
    expect(canTransition("expired", "reject").allowed).toBe(false);
    expect(canTransition("sent", "reject").allowed).toBe(false);
  });

  it("validateRejectionReason mirrors API guard", () => {
    expect(validateRejectionReason("ab").ok).toBe(false);
    expect(validateRejectionReason("a".repeat(201)).ok).toBe(false);
    expect(validateRejectionReason("Tone too direct").ok).toBe(true);
    expect(validateRejectionReason(null as never).ok).toBe(false);
    expect(validateRejectionReason(undefined as never).ok).toBe(false);
  });

  it("rejected reason feeds the classifier and emits dominant insight", () => {
    const reasons = [
      "Tone too aggressive — soften",
      "Pushy tone, won't land",
      "Tone is too direct",
      "Wrong moment, recipient just signed competitor",
    ];
    const classified = reasons.map(classifyRejection);
    const counts = aggregateRejections(classified);
    expect(counts.tone).toBe(3);
    expect(counts.timing).toBe(1);
    const insight = dominantInsight(counts);
    expect(insight).toEqual({ category: "tone", count: 3 });
  });

  it("rejected is terminal", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(canTransition("rejected", "approve").allowed).toBe(false);
    expect(canTransition("rejected", "expire").allowed).toBe(false);
    expect(canTransition("rejected", "edit").allowed).toBe(false);
  });
});

describe("flow: pending → expired", () => {
  it("expire transition is allowed only from pending", () => {
    expect(canTransition("pending_approval", "expire").allowed).toBe(true);
    expect(canTransition("approved", "expire").allowed).toBe(false);
    expect(canTransition("rejected", "expire").allowed).toBe(false);
    expect(canTransition("sent", "expire").allowed).toBe(false);
  });

  it("expiry predicate fires only when draft is older than cutoff AND pending", () => {
    const now = new Date("2026-05-07T12:00:00Z");
    const cutoff = expiryCutoff(now, 72);

    // Pending + old → expire
    expect(
      shouldExpire(
        { generatedAt: "2026-05-03T12:00:00Z", status: "pending_approval" },
        cutoff,
      ),
    ).toBe(true);

    // Approved + old → don't expire
    expect(
      shouldExpire(
        { generatedAt: "2026-05-03T12:00:00Z", status: "approved" },
        cutoff,
      ),
    ).toBe(false);

    // Pending + recent → don't expire
    expect(
      shouldExpire(
        { generatedAt: "2026-05-07T01:00:00Z", status: "pending_approval" },
        cutoff,
      ),
    ).toBe(false);
  });

  it("expired is terminal", () => {
    expect(isTerminal("expired")).toBe(true);
    expect(canTransition("expired", "approve").allowed).toBe(false);
  });
});

describe("flow: edit during pending", () => {
  it("edit allowed only from pending", () => {
    expect(canTransition("pending_approval", "edit").allowed).toBe(true);
    expect(canTransition("approved", "edit").allowed).toBe(false);
    expect(canTransition("rejected", "edit").allowed).toBe(false);
    expect(canTransition("expired", "edit").allowed).toBe(false);
    expect(canTransition("sent", "edit").allowed).toBe(false);
  });
});

describe("flow: router decision + draft creation", () => {
  it("manual tenant routes to draft queue with status=pending_approval", () => {
    expect(decideRouteMode({ approvalMode: "manual" })).toBe("manual");
    const row = buildDraftRow({
      tenantId: "t",
      sequenceId: "s",
      stepId: "st",
      enrollmentId: "e",
      contactId: "c",
      subject: "Hi",
      bodyHtml: "<p>x</p>",
      bodyText: "x",
      stepNumber: 2,
      signalHint: "post_funding",
    });
    expect(row.status).toBe("pending_approval");
    expect(row.version).toBe(1);
    expect(row.triggerReason).toBe("post_funding");
  });

  it("auto tenant skips draft (decideRouteMode === auto)", () => {
    expect(decideRouteMode({ approvalMode: "auto" })).toBe("auto");
  });

  it("default tenant (no settings) is conservative — manual", () => {
    expect(decideRouteMode(null)).toBe("manual");
    expect(decideRouteMode({})).toBe("manual");
  });
});

describe("race semantics — concurrent approve simulated", () => {
  /**
   * The API route uses atomic UPDATE WHERE version=N. In memory,
   * the equivalent is : transitions are allowed AT MOST once
   * regardless of how many callers race. We model this by
   * simulating two callers each trying to flip pending→approved.
   * Only the one with the matching version stamp succeeds.
   */
  it("two concurrent approves : first wins, second sees stale version", () => {
    let dbVersion = 1;

    function tryApprove(callerVersion: number): { ok: boolean; reason?: string } {
      const t = canTransition("pending_approval", "approve");
      if (!t.allowed) return { ok: false, reason: t.reason };
      if (callerVersion !== dbVersion) {
        return { ok: false, reason: "version mismatch" };
      }
      dbVersion += 1;
      return { ok: true };
    }

    const a = tryApprove(1);
    expect(a.ok).toBe(true);
    expect(dbVersion).toBe(2);

    // Second caller still has version=1 cached — must fail.
    const b = tryApprove(1);
    expect(b.ok).toBe(false);
    expect(b.reason).toBe("version mismatch");
    expect(dbVersion).toBe(2);
  });

  it("expire then approve : expire wins, approve fails", () => {
    let status: "pending_approval" | "expired" | "approved" = "pending_approval";

    // Expire fires (cron).
    if (canTransition(status, "expire").allowed) status = "expired";
    expect(status).toBe("expired");

    // Approve attempt afterwards — rejected by state machine.
    expect(canTransition(status, "approve").allowed).toBe(false);
  });

  it("approve then reject : approve wins, reject is rejected (no take-backs)", () => {
    let status: "pending_approval" | "approved" | "rejected" = "pending_approval";
    if (canTransition(status, "approve").allowed) status = "approved";
    expect(canTransition(status, "reject").allowed).toBe(false);
  });
});
