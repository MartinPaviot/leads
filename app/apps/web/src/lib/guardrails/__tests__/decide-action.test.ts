import { describe, it, expect } from "vitest";
import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";

// ── Action-class fixtures (design §2 definitions) ──
const READ:        DecideActionInput["action"] = { mutating: false, confirm: "never" };
const REVERSIBLE:  DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "never" };
const REV_RISKY:   DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "risky" };
const REV_ALWAYS:  DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "always" };
const DESTRUCTIVE: DecideActionInput["action"] = { mutating: true, reversible: false, outbound: false, cost: "free", confirm: "never" };
const OUTBOUND:    DecideActionInput["action"] = { mutating: true, reversible: false, outbound: true, cost: "free", confirm: "risky" };
const PAID:        DecideActionInput["action"] = { mutating: true, reversible: false, outbound: true, cost: "money", confirm: "always" };

const MODES: ApprovalModeV2[] = ["review-each", "batch-daily", "auto-high-confidence"];

function d(action: DecideActionInput["action"], approvalMode: ApprovalModeV2,
           role: "admin" | "member" | "viewer" = "member", confidence?: number) {
  return decideAction({ action, approvalMode, role, confidence }).disposition;
}

describe("decideAction — viewer floor (AC-1 / AC-2)", () => {
  it("viewer refuses every write/outbound/paid in every mode", () => {
    for (const m of MODES) {
      for (const a of [REVERSIBLE, REV_RISKY, DESTRUCTIVE, OUTBOUND, PAID]) {
        expect(d(a, m, "viewer")).toBe("refuse");
      }
    }
  });
  it("viewer may read in every mode", () => {
    for (const m of MODES) expect(d(READ, m, "viewer")).toBe("execute");
  });
});

describe("decideAction — paid floor (AC-3)", () => {
  it("paid always confirms regardless of mode, even auto + confidence 1", () => {
    for (const m of MODES) expect(d(PAID, m, "member", 1)).toBe("confirm");
  });
});

describe("decideAction — read executes everywhere (AC-5)", () => {
  it("read → execute in every mode for member", () => {
    for (const m of MODES) expect(d(READ, m, "member")).toBe("execute");
  });
});

describe("decideAction — review-each (AC-4)", () => {
  it("every write/outbound is carded", () => {
    for (const a of [REVERSIBLE, REV_RISKY, DESTRUCTIVE, OUTBOUND]) {
      expect(d(a, "review-each")).toBe("confirm");
    }
  });
});

describe("decideAction — batch-daily (AC-6 / AC-7 / AC-8)", () => {
  it("outbound → queue", () => expect(d(OUTBOUND, "batch-daily")).toBe("queue"));
  it("reversible mutation → queue", () => expect(d(REVERSIBLE, "batch-daily")).toBe("queue"));
  it("reversible confirm:risky → queue (mode floor dominates, policy moot)", () =>
    expect(d(REV_RISKY, "batch-daily")).toBe("queue"));
  it("reversible confirm:always → queue (mode floor dominates, policy moot)", () =>
    expect(d(REV_ALWAYS, "batch-daily")).toBe("queue"));
  it("destructive → confirm (never silently batched)", () => expect(d(DESTRUCTIVE, "batch-daily")).toBe("confirm"));
});

describe("decideAction — auto-high-confidence (AC-9 / AC-10 / AC-11 / AC-13)", () => {
  it("reversible confirm:never executes when confidence >= bar", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", 0.99)).toBe("execute"));
  it("reversible confirm:never confirms when confidence missing", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", undefined)).toBe("confirm"));
  it("reversible confirm:never confirms when below bar", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", 0.1)).toBe("confirm"));
  it("reversible confirm:always confirms even at confidence 1 (AC-13)", () =>
    expect(d(REV_ALWAYS, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("reversible confirm:risky confirms (AC-12 raise-the-bar)", () =>
    expect(d(REV_RISKY, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("destructive always confirms even at confidence 1 (AC-11)", () =>
    expect(d(DESTRUCTIVE, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("outbound always confirms even at confidence 1 (AC-11)", () =>
    expect(d(OUTBOUND, "auto-high-confidence", "member", 1)).toBe("confirm"));
});

describe("decideAction — F005 learned thresholds (extra arg)", () => {
  it("learned threshold lowers the auto-exec bar", () => {
    const r = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.78 },
      { actionKey: "contact-update", learnedThresholds: { "contact-update": 0.6 } },
    );
    expect(r.disposition).toBe("execute"); // 0.78 >= learned 0.6 (base would be 0.75)
  });
  it("no actionKey → moderate default bar 0.8 (0.79 < 0.8 → confirm)", () => {
    const r = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.79 },
    );
    expect(r.disposition).toBe("confirm");
  });
  it("no actionKey, confidence >= 0.8 default → execute", () => {
    const r = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.8 },
    );
    expect(r.disposition).toBe("execute");
  });
  it("with actionKey but no learned override → base HIGH_CONFIDENCE_THRESHOLDS", () => {
    // task-create base threshold is 0.7
    const below = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.69 },
      { actionKey: "task-create" },
    );
    const at = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.7 },
      { actionKey: "task-create" },
    );
    expect(below.disposition).toBe("confirm");
    expect(at.disposition).toBe("execute");
  });
});

describe("decideAction — fail-safe (AC-21)", () => {
  it("malformed mutating scalar → treated as mutating → confirm under review-each", () => {
    // @ts-expect-error intentional malformed input
    expect(decideAction({ action: { mutating: "yes", confirm: "never" }, approvalMode: "review-each", role: "member" }).disposition).toBe("confirm");
  });
  it("unknown confirm scalar → safest (always) → confirm under auto", () => {
    // @ts-expect-error intentional malformed input
    expect(decideAction({ action: { mutating: true, reversible: true, confirm: "garbage" }, approvalMode: "auto-high-confidence", role: "member", confidence: 1 }).disposition).toBe("confirm");
  });
  it("unknown cost scalar → coerced to free (no silent paid escape)", () => {
    // @ts-expect-error intentional malformed input
    const r = decideAction({ action: { mutating: true, reversible: true, outbound: false, cost: "bogus", confirm: "never" }, approvalMode: "auto-high-confidence", role: "member", confidence: 1 });
    // cost coerced free, reversible confirm:never, conf 1 >= default 0.8 → execute
    expect(r.disposition).toBe("execute");
  });
  it("unknown approvalMode → confirm", () => {
    // @ts-expect-error intentional malformed mode
    expect(decideAction({ action: REVERSIBLE, approvalMode: "weird", role: "member" }).disposition).toBe("confirm");
  });
  it("every result carries a non-empty reason", () => {
    for (const m of MODES) {
      for (const a of [READ, REVERSIBLE, DESTRUCTIVE, OUTBOUND, PAID]) {
        expect(decideAction({ action: a, approvalMode: m, role: "member" }).reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("decideAction — signature parity with README §3.5bis", () => {
  it("input shape matches the frozen contract (compile-time)", () => {
    const frozen: DecideActionInput = {
      action: { mutating: true, outbound: false, reversible: true, cost: "free", confirm: "never" },
      approvalMode: "review-each",
      role: "admin",
      confidence: 0.5,
    };
    expect(decideAction(frozen).disposition).toBeDefined();
  });
  it("the frozen 4-key call shape is a valid subset (single-arg call compiles)", () => {
    const r = decideAction({ action: READ, approvalMode: "review-each", role: "member", confidence: 0.5 });
    expect(r.disposition).toBe("execute");
  });
});
