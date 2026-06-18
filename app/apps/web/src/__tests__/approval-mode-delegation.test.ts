/**
 * CLE-10 T16 — `enforceAgentApprovalMode` delegation parity.
 *
 * After CLE-10, `enforceAgentApprovalMode` is a thin delegation to the single
 * authority `decideAction` (via GUARDED_ACTION_METADATA). This cartesian test pins
 * the `{ allowed, queueAs }` mapping across mode × GuardedAction × confidence and
 * makes the ONE intended behaviour divergence explicit:
 *
 *   Under `auto-high-confidence`, the OUTBOUND verbs (`email-send`, `email-reply`,
 *   `sequence-enrollment`) now return { allowed:false, queueAs:"pending-per-item" }
 *   (confirm). Previously they auto-dispatched (allowed:true) at confidence ≥ threshold.
 *   This is the intended safety tightening — "no silent outbound" (req AC-11). The
 *   audit's whole thesis: never silently fire external sends.
 *
 * Non-outbound reversible verbs (contact-*, task-create, deal-stage-change) keep the
 * EXACT confidence-threshold behaviour.
 */
import { describe, it, expect } from "vitest";
import {
  enforceAgentApprovalMode,
  HIGH_CONFIDENCE_THRESHOLDS,
  type ApprovalModeV2,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";

const ALL_ACTIONS: GuardedAction[] = [
  "email-send",
  "email-reply",
  "contact-create",
  "contact-update",
  "deal-stage-change",
  "task-create",
  "sequence-enrollment",
];
const OUTBOUND_ACTIONS: GuardedAction[] = ["email-send", "email-reply", "sequence-enrollment"];
// Reversible non-outbound with confirm:"never" — the ONLY verbs that auto-execute on
// confidence under auto-high-confidence (deal-stage-change is confirm:"risky" → always
// confirms, see CONFIRM_RISKY_ACTIONS below).
const REVERSIBLE_ACTIONS: GuardedAction[] = ["contact-create", "contact-update", "task-create"];
const CONFIRM_RISKY_ACTIONS: GuardedAction[] = ["deal-stage-change"];
const MODES: ApprovalModeV2[] = ["review-each", "batch-daily", "auto-high-confidence"];
const CONFIDENCES = [0, 0.5, 0.86, 0.95, 1];

describe("enforceAgentApprovalMode — review-each (always per-item)", () => {
  for (const action of ALL_ACTIONS) {
    for (const confidence of CONFIDENCES) {
      it(`${action} @${confidence} → blocked, pending-per-item`, () => {
        const r = enforceAgentApprovalMode({ mode: "review-each", action, confidence });
        expect(r.allowed).toBe(false);
        expect(r.queueAs).toBe("pending-per-item");
      });
    }
  }
});

describe("enforceAgentApprovalMode — batch-daily (reversible+outbound queue daily)", () => {
  for (const action of ALL_ACTIONS) {
    for (const confidence of CONFIDENCES) {
      it(`${action} @${confidence} → blocked, pending-daily-batch`, () => {
        const r = enforceAgentApprovalMode({ mode: "batch-daily", action, confidence });
        expect(r.allowed).toBe(false);
        // All 7 GuardedActions are either reversible (queue) or outbound (queue) under
        // batch-daily — none is destructive — so every one lands in the daily batch.
        expect(r.queueAs).toBe("pending-daily-batch");
      });
    }
  }
});

describe("enforceAgentApprovalMode — auto-high-confidence: reversible non-outbound (UNCHANGED threshold behaviour)", () => {
  for (const action of REVERSIBLE_ACTIONS) {
    const threshold = HIGH_CONFIDENCE_THRESHOLDS[action];
    it(`${action} executes at/above its threshold ${threshold}`, () => {
      const r = enforceAgentApprovalMode({ mode: "auto-high-confidence", action, confidence: threshold });
      expect(r.allowed).toBe(true);
      expect(r.queueAs).toBeNull();
    });
    it(`${action} falls back to per-item below its threshold ${threshold}`, () => {
      const r = enforceAgentApprovalMode({ mode: "auto-high-confidence", action, confidence: threshold - 0.05 });
      expect(r.allowed).toBe(false);
      expect(r.queueAs).toBe("pending-per-item");
    });
    it(`${action} falls back to per-item when confidence is null`, () => {
      const r = enforceAgentApprovalMode({ mode: "auto-high-confidence", action, confidence: null });
      expect(r.allowed).toBe(false);
      expect(r.queueAs).toBe("pending-per-item");
    });
  }
});

describe("enforceAgentApprovalMode — auto-high-confidence: reversible confirm:risky always confirms (AC-12)", () => {
  for (const action of CONFIRM_RISKY_ACTIONS) {
    for (const confidence of CONFIDENCES) {
      it(`${action} @${confidence} → blocked, pending-per-item (own confirm:risky raises the bar)`, () => {
        const r = enforceAgentApprovalMode({ mode: "auto-high-confidence", action, confidence });
        expect(r.allowed).toBe(false);
        expect(r.queueAs).toBe("pending-per-item");
      });
    }
  }
});

describe("enforceAgentApprovalMode — auto-high-confidence: OUTBOUND (THE intended divergence, AC-11)", () => {
  // Previously: email-send @>=0.85 → allowed:true (silent send). NOW: always confirm.
  for (const action of OUTBOUND_ACTIONS) {
    for (const confidence of CONFIDENCES) {
      it(`${action} @${confidence} → blocked, pending-per-item (no silent outbound)`, () => {
        const r = enforceAgentApprovalMode({ mode: "auto-high-confidence", action, confidence });
        expect(r.allowed).toBe(false);
        expect(r.queueAs).toBe("pending-per-item");
      });
    }
  }
});

describe("enforceAgentApprovalMode — F005 learned thresholds still honoured for reversible non-outbound", () => {
  it("contact-update with a lowered learned threshold executes below the base bar", () => {
    // base 0.75; learned 0.6; confidence 0.7 → execute
    const r = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "contact-update",
      confidence: 0.7,
      learnedThresholds: { "contact-update": 0.6 },
    });
    expect(r.allowed).toBe(true);
  });
  it("learned threshold does NOT unlock an outbound send (still confirms)", () => {
    const r = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 1,
      learnedThresholds: { "email-send": 0.1 },
    });
    expect(r.allowed).toBe(false);
    expect(r.queueAs).toBe("pending-per-item");
  });
});
