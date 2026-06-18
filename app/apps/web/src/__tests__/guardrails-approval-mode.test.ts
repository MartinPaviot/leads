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
  it("allows a reversible confirm:never action when confidence ≥ threshold", () => {
    // CLE-10 (AC-11): outbound sends now ALWAYS confirm under autonomy, so the
    // threshold-pass case is demonstrated on a reversible non-outbound action whose
    // own policy is confirm:never (only those auto-execute on confidence — AC-12).
    const threshold = HIGH_CONFIDENCE_THRESHOLDS["task-create"];
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "task-create",
      confidence: threshold + 0.01,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.queueAs).toBeNull();
    expect(decision.reason).toMatch(/auto-high-confidence/);
  });

  it("falls back to per-item review when a reversible confirm:never action is below threshold", () => {
    const threshold = HIGH_CONFIDENCE_THRESHOLDS["task-create"];
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "task-create",
      confidence: threshold - 0.1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
    expect(decision.reason).toMatch(/fall back to review/);
  });

  it("outbound email-send ALWAYS confirms under autonomy, even above threshold (AC-11)", () => {
    const threshold = HIGH_CONFIDENCE_THRESHOLDS["email-send"];
    const decision = enforceAgentApprovalMode({
      mode: "auto-high-confidence",
      action: "email-send",
      confidence: threshold + 0.01,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.queueAs).toBe("pending-per-item");
    expect(decision.reason).toMatch(/outbound/);
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

// CLE-13 FOLLOWUPS #2 — `signalAutoEnroll`'s "always defers" guarantee rested on
// a code-trace of GUARDED_ACTION_METADATA["sequence-enrollment"] (outbound:true,
// confirm:"always"). Lock it BEHAVIORALLY through the real authority so flipping
// that metadata (e.g. to outbound:false / confirm:never) fails a test here, not in
// prod. The signal-auto-enroll approval test mocks enforceAgentApprovalMode, so it
// cannot catch a metadata regression; this can.
describe("enforceAgentApprovalMode — sequence-enrollment NEVER auto-executes (the auto-enroll defer guarantee)", () => {
  const MODES = ["review-each", "batch-daily", "auto-high-confidence"] as const;
  for (const mode of MODES) {
    it(`${mode}: confidence 1 + forced 0.0 learned bar still never allows`, () => {
      const d = enforceAgentApprovalMode({
        mode,
        action: "sequence-enrollment",
        confidence: 1,
        // Even a forged 0.0 learned bar cannot unlock it (HARD RULE: outbound
        // never auto-executes).
        learnedThresholds: { "sequence-enrollment": 0 },
      });
      expect(d.allowed).toBe(false);
      expect(d.queueAs).not.toBeNull(); // always parks for human review/batch
    });
  }

  it("the other two outbound verbs are likewise never auto-allowed at confidence 1", () => {
    for (const action of ["email-send", "email-reply"] as const) {
      const d = enforceAgentApprovalMode({
        mode: "auto-high-confidence",
        action,
        confidence: 1,
        learnedThresholds: { [action]: 0 },
      });
      expect(d.allowed).toBe(false);
    }
  });
});
