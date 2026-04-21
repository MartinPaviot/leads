import { describe, it, expect } from "vitest";
import {
  enforceAgentApprovalMode,
  readApprovalMode,
  HIGH_CONFIDENCE_THRESHOLDS,
  type ApprovalModeStored,
} from "@/lib/guardrails/approval-mode";

describe("readApprovalMode — legacy coercion", () => {
  it.each<[ApprovalModeStored | undefined | null, string]>([
    ["review-each", "review-each"],
    ["batch-daily", "batch-daily"],
    ["auto-high-confidence", "auto-high-confidence"],
    ["auto", "auto-high-confidence"],
    ["ask", "review-each"],
    ["manual", "review-each"],
    ["off", "review-each"],
    [undefined, "review-each"],
    [null, "review-each"],
  ])("coerces %s → %s", (input, expected) => {
    expect(readApprovalMode({ agentApprovalMode: input as never })).toBe(expected);
  });

  it("returns review-each for unknown future values (safety default)", () => {
    expect(
      readApprovalMode({ agentApprovalMode: "future-mode" as never }),
    ).toBe("review-each");
  });
});

describe("enforceAgentApprovalMode — review-each", () => {
  it("always queues, regardless of action or confidence", () => {
    const decision = enforceAgentApprovalMode({
      mode: "review-each",
      action: "email-send",
      confidence: 0.99,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
    expect(decision.reason).toMatch(/review-each/);
  });

  it("queues even when confidence is null", () => {
    const decision = enforceAgentApprovalMode({
      mode: "review-each",
      action: "contact-create",
      confidence: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
  });
});

describe("enforceAgentApprovalMode — batch-daily", () => {
  it("always queues into the daily bucket", () => {
    const decision = enforceAgentApprovalMode({
      mode: "batch-daily",
      action: "email-reply",
      confidence: 0.95,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-daily-batch");
    expect(decision.reason).toMatch(/batch-daily/);
  });
});

describe("enforceAgentApprovalMode — auto-high-confidence", () => {
  it("allows when confidence ≥ threshold", () => {
    const threshold = HIGH_CONFIDENCE_THRESHOLDS["email-send"];
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: threshold + 0.01,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.queueAs).toBeNull();
    expect(decision.reason).toMatch(/auto-high-confidence/);
  });

  it("falls back to per-item review when confidence < threshold", () => {
    const threshold = HIGH_CONFIDENCE_THRESHOLDS["email-send"];
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: threshold - 0.1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
    expect(decision.reason).toMatch(/falling back to review-each/);
  });

  it("falls back to per-item review when confidence is null", () => {
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "contact-create",
      confidence: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
  });

  it("blocks sequence-enrollment even at confidence 1.0", () => {
    // Threshold for sequence-enrollment is 1.1 (unreachable) until
    // WS-7 ships the undo layer. Verified here so a future change
    // that lowers the threshold breaks the test.
    expect(HIGH_CONFIDENCE_THRESHOLDS["sequence-enrollment"]).toBeGreaterThan(1);

    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "sequence-enrollment",
      confidence: 1.0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
  });

  it("has different thresholds for different actions", () => {
    // Spot-check that the threshold table has meaningful variation.
    expect(HIGH_CONFIDENCE_THRESHOLDS["deal-stage-change"]).toBeGreaterThan(
      HIGH_CONFIDENCE_THRESHOLDS["task-create"],
    );
  });
});

describe("enforceAgentApprovalMode — determinism", () => {
  it("produces identical decisions for identical inputs", () => {
    const input = {
      mode: "auto-high-confidence" as const,
      action: "email-send" as const,
      confidence: 0.9,
      trustScore: 0.6,
    };
    const a = enforceAgentApprovalMode(input);
    const b = enforceAgentApprovalMode(input);
    expect(a).toEqual(b);
  });
});
