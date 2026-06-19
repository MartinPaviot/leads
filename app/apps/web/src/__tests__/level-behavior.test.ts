/**
 * CLE-16 T2/T4 — the level-behavior SSOT (clamp, excluded→ceiling, trust floors)
 * + the level × action-class disposition table (design §3.1) asserted through
 * the REAL composition: resolveEffectiveMode → buildEffectiveThresholdMap →
 * decideAction.
 */
import { describe, it, expect } from "vitest";
import {
  buildEffectiveThresholdMap,
  clampThreshold,
  requiredTrustForLevel,
  HARD_EXCLUDED_ACTIONS,
  STRATEGIC_RELAXED_THRESHOLDS,
} from "@/lib/guardrails/level-behavior";
import {
  resolveEffectiveMode,
  HIGH_CONFIDENCE_THRESHOLDS,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";
import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

// ── clampThreshold (EC-5 / AC-22) ──────────────────────────────
describe("clampThreshold", () => {
  it("NaN / non-finite → CEILING 1.0 (fail-safe: hardest bar)", () => {
    expect(clampThreshold(NaN)).toBe(1.0);
    expect(clampThreshold(Infinity)).toBe(1.0);
    expect(clampThreshold(-Infinity)).toBe(1.0);
  });
  it("below floor → 0.5", () => {
    expect(clampThreshold(0.1)).toBe(0.5);
    expect(clampThreshold(0)).toBe(0.5);
    expect(clampThreshold(-2)).toBe(0.5);
  });
  it("above ceiling → 1.0", () => {
    expect(clampThreshold(1.5)).toBe(1.0);
    expect(clampThreshold(1.1)).toBe(1.0);
  });
  it("in-range → unchanged", () => {
    expect(clampThreshold(0.7)).toBe(0.7);
    expect(clampThreshold(0.5)).toBe(0.5);
    expect(clampThreshold(1.0)).toBe(1.0);
  });
});

// ── requiredTrustForLevel (AC-11) ──────────────────────────────
describe("requiredTrustForLevel", () => {
  it("mirrors suggestedLevel + the strategic-80 rule", () => {
    expect(requiredTrustForLevel("copilot")).toBe(0);
    expect(requiredTrustForLevel("guided")).toBe(50);
    expect(requiredTrustForLevel("autonomous")).toBe(65);
    expect(requiredTrustForLevel("strategic")).toBe(80);
  });
});

// ── buildEffectiveThresholdMap excluded→ceiling (AC-6 / AC-7 / EC-8) ──
describe("buildEffectiveThresholdMap", () => {
  it("forces every HARD_EXCLUDED_ACTIONS member to 1.0 even with a 0.0 learned key", () => {
    const learned: Record<string, number> = {};
    for (const a of HARD_EXCLUDED_ACTIONS) learned[a] = 0.0;
    const map = buildEffectiveThresholdMap({ learned, relaxThresholds: true });
    for (const a of HARD_EXCLUDED_ACTIONS) expect(map[a]).toBe(1.0);
  });

  it("non-excluded class picks learned ?? static, clamped", () => {
    const map = buildEffectiveThresholdMap({
      learned: { "contact-update": 0.6, "task-create": 0.1 /* below floor */ },
      relaxThresholds: false,
    });
    expect(map["contact-update"]).toBe(0.6); // learned
    expect(map["task-create"]).toBe(0.5); // clamped up from 0.1
    expect(map["deal-stage-change"]).toBe(HIGH_CONFIDENCE_THRESHOLDS["deal-stage-change"]); // static
  });

  it("relaxThresholds=true uses STRATEGIC_RELAXED_THRESHOLDS for non-excluded classes", () => {
    const map = buildEffectiveThresholdMap({ learned: {}, relaxThresholds: true });
    expect(map["contact-update"]).toBe(STRATEGIC_RELAXED_THRESHOLDS["contact-update"]);
    expect(map["contact-create"]).toBe(STRATEGIC_RELAXED_THRESHOLDS["contact-create"]);
    expect(map["task-create"]).toBe(STRATEGIC_RELAXED_THRESHOLDS["task-create"]);
  });

  it("relaxed overrides learned for a non-excluded class", () => {
    const map = buildEffectiveThresholdMap({
      learned: { "contact-update": 0.9 },
      relaxThresholds: true,
    });
    expect(map["contact-update"]).toBe(STRATEGIC_RELAXED_THRESHOLDS["contact-update"]); // relaxed wins
  });
});

// ── The §3.1 disposition table via the real seams (AC-14 / AC-15) ──
type Klass = "read" | "reversible-never" | "reversible-risky" | "destructive" | "outbound" | "paid";

const CLASS_META: Record<Klass, { meta: DecideActionInput["action"]; key?: GuardedAction }> = {
  read: { meta: { mutating: false, outbound: false, reversible: true, cost: "free", confirm: "never" } },
  "reversible-never": {
    meta: { mutating: true, outbound: false, reversible: true, cost: "free", confirm: "never" },
    key: "contact-update",
  },
  "reversible-risky": {
    meta: { mutating: true, outbound: false, reversible: true, cost: "free", confirm: "risky" },
    key: "deal-stage-change",
  },
  destructive: { meta: { mutating: true, outbound: false, reversible: false, cost: "free", confirm: "never" } },
  outbound: {
    meta: { mutating: true, outbound: true, reversible: false, cost: "free", confirm: "risky" },
    key: "email-send",
  },
  paid: { meta: { mutating: true, outbound: false, reversible: true, cost: "money", confirm: "never" } },
};

/** Drive a (level, class, confidence) cell through the real composition. */
function dispose(level: AutonomyLevel, klass: Klass, confidence: number, trustOverall: number) {
  const { mode, relaxThresholds } = resolveEffectiveMode({
    settings: { agentApprovalMode: "review-each" },
    level,
    trustOverall,
  });
  const learnedThresholds = buildEffectiveThresholdMap({ learned: {}, relaxThresholds });
  const { meta, key } = CLASS_META[klass];
  return decideAction(
    { action: meta, approvalMode: mode, role: "member", confidence },
    { actionKey: key, learnedThresholds },
  ).disposition;
}

describe("level × action-class disposition table (§3.1)", () => {
  const carding: AutonomyLevel[] = ["copilot", "guided"];

  for (const level of carding) {
    it(`${level}: read=execute, every mutation/outbound/paid=confirm`, () => {
      expect(dispose(level, "read", 1, 100)).toBe("execute");
      expect(dispose(level, "reversible-never", 1, 100)).toBe("confirm");
      expect(dispose(level, "reversible-risky", 1, 100)).toBe("confirm");
      expect(dispose(level, "destructive", 1, 100)).toBe("confirm");
      expect(dispose(level, "outbound", 1, 100)).toBe("confirm");
      expect(dispose(level, "paid", 1, 100)).toBe("confirm");
    });
  }

  it("autonomous: reversible confirm:never executes above the bar, else confirm; hard classes confirm", () => {
    expect(dispose("autonomous", "read", 0, 50)).toBe("execute");
    // static contact-update bar is 0.75
    expect(dispose("autonomous", "reversible-never", 0.8, 50)).toBe("execute");
    expect(dispose("autonomous", "reversible-never", 0.6, 50)).toBe("confirm");
    expect(dispose("autonomous", "reversible-risky", 1, 50)).toBe("confirm"); // risky cards
    expect(dispose("autonomous", "destructive", 1, 50)).toBe("confirm");
    expect(dispose("autonomous", "outbound", 1, 50)).toBe("confirm");
    expect(dispose("autonomous", "paid", 1, 50)).toBe("confirm");
  });

  it("strategic trust>=80: relaxed bar on reversible confirm:never; hard classes still confirm", () => {
    // relaxed contact-update bar is 0.6 — a 0.65 confidence executes (would NOT under autonomous@0.75)
    expect(dispose("strategic", "reversible-never", 0.65, 80)).toBe("execute");
    expect(dispose("autonomous", "reversible-never", 0.65, 80)).toBe("confirm");
    expect(dispose("strategic", "destructive", 1, 80)).toBe("confirm");
    expect(dispose("strategic", "outbound", 1, 80)).toBe("confirm");
    expect(dispose("strategic", "paid", 1, 80)).toBe("confirm");
  });

  it("strategic trust<80: falls back to static bar (no relaxation)", () => {
    // at trust 50, relaxThresholds=false → static 0.75; 0.65 confidence confirms
    expect(dispose("strategic", "reversible-never", 0.65, 50)).toBe("confirm");
    expect(dispose("strategic", "reversible-never", 0.8, 50)).toBe("execute");
  });

  it("AC-15 distinctness: autonomous disposition ≠ copilot on reversible confirm:never", () => {
    expect(dispose("copilot", "reversible-never", 0.9, 100)).toBe("confirm");
    expect(dispose("autonomous", "reversible-never", 0.9, 100)).toBe("execute");
  });

  it("AC-15 distinctness: strategic(trust≥80) applies a LOWER bar than autonomous", () => {
    // confidence between relaxed (0.6) and static (0.75): strategic executes, autonomous confirms
    expect(dispose("strategic", "reversible-never", 0.65, 80)).toBe("execute");
    expect(dispose("autonomous", "reversible-never", 0.65, 80)).toBe("confirm");
  });
});
