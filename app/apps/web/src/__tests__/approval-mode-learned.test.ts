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

  it("auto-high-confidence uses learned threshold when available", () => {
    // Default threshold for email-send is 0.85
    // Learned threshold is 0.6 (agent earned trust)
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 0.7,
      learnedThresholds: { "email-send": 0.6 },
    });
    expect(result.allowed).toBe(true);
  });

  it("auto-high-confidence blocks when below learned threshold", () => {
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 0.5,
      learnedThresholds: { "email-send": 0.6 },
    });
    expect(result.allowed).toBe(false);
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

  it("works without learned thresholds (backwards compatible)", () => {
    const result = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: 0.9,
    });
    expect(result.allowed).toBe(true);
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
