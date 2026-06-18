import { describe, it, expect } from "vitest";
import { enforceAgentApprovalMode } from "@/lib/guardrails/approval-mode";

describe("Approval Mode with Learned Thresholds (F005)", () => {
  it("review-each always blocks regardless of learned thresholds", () => {
    const result = enforceAgentApprovalMode({
      mode: "review-each",
      action: "email-send",
      confidence: 1.0,
      learnedThresholds: { "email-send": 0.5 },
    });
    expect(result.allowed).toBe(false);
    expect(result.queueAs).toBe("pending-per-item");
  });

  it("auto-high-confidence uses learned threshold for a REVERSIBLE non-outbound action", () => {
    // CLE-10 (AC-11): outbound sends NO LONGER auto-dispatch under autonomy — they
    // always confirm. The learned-threshold mechanism is now demonstrated on a
    // reversible, non-outbound action (contact-update). Base threshold 0.75; learned
    // 0.6 (agent earned trust); confidence 0.7 → executes.
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "contact-update",
      confidence: 0.7,
      learnedThresholds: { "contact-update": 0.6 },
    });
    expect(result.allowed).toBe(true);
  });

  it("auto-high-confidence blocks when below learned threshold (reversible non-outbound)", () => {
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "contact-update",
      confidence: 0.5,
      learnedThresholds: { "contact-update": 0.6 },
    });
    expect(result.allowed).toBe(false);
  });

  it("auto-high-confidence ALWAYS confirms an outbound send, even above the learned threshold (AC-11, intended CLE-10 divergence)", () => {
    // Was previously allowed:true at confidence ≥ learned/base threshold. CLE-10's
    // unified plane makes outbound always confirm under autonomy — no silent external
    // send. This is the single deliberate behaviour change (design §6.1 / §10 tension #2).
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 0.7,
      learnedThresholds: { "email-send": 0.6 },
    });
    expect(result.allowed).toBe(false);
    expect(result.queueAs).toBe("pending-per-item");
  });

  it("falls back to base threshold when learned not available for action", () => {
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "deal-stage-change",
      confidence: 0.85,
      learnedThresholds: { "email-send": 0.6 }, // no deal-stage-change
    });
    // Base threshold for deal-stage-change is 0.9
    expect(result.allowed).toBe(false);
  });

  it("works without learned thresholds (backwards compatible) — reversible confirm:never auto-executes", () => {
    // CLE-10 (AC-11): outbound `email-send @0.9` is no longer allowed:true (it now
    // confirms). Backwards-compat of the threshold path is demonstrated on a reversible
    // non-outbound action whose own policy is confirm:never (only these auto-execute):
    // task-create base 0.7, confidence 0.9 → allowed.
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "task-create",
      confidence: 0.9,
    });
    expect(result.allowed).toBe(true);
  });

  it("outbound email-send @0.9 now CONFIRMS (was allowed:true pre-CLE-10) — AC-11 no silent outbound", () => {
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 0.9,
    });
    expect(result.allowed).toBe(false);
    expect(result.queueAs).toBe("pending-per-item");
  });

  it("batch-daily queues regardless of thresholds", () => {
    const result = enforceAgentApprovalMode({
      mode: "batch-daily",
      action: "task-create",
      confidence: 1.0,
      learnedThresholds: { "task-create": 0.1 },
    });
    expect(result.allowed).toBe(false);
    expect(result.queueAs).toBe("pending-daily-batch");
  });
});
