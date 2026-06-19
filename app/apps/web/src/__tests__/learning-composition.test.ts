/**
 * CLE-16 T10 — the background-loop composition (AC-1 / AC-6 loop / EC-5 / EC-11).
 * The loop builds the injected map via buildEffectiveThresholdMap and forwards
 * it to enforceAgentApprovalMode (which CLE-10 hands to decideAction's `extra`).
 * This mirrors exactly what agent-reactor / autonomous-pipeline do per tenant.
 */
import { describe, it, expect } from "vitest";
import { enforceAgentApprovalMode, resolveEffectiveMode } from "@/lib/guardrails/approval-mode";
import { buildEffectiveThresholdMap } from "@/lib/guardrails/level-behavior";

function loopDecision(args: {
  level: "autonomous" | "strategic";
  trust: number;
  learned: Record<string, number>;
  action: Parameters<typeof enforceAgentApprovalMode>[0]["action"];
  confidence: number;
}) {
  const { mode, relaxThresholds } = resolveEffectiveMode({
    settings: { agentApprovalMode: "review-each" },
    level: args.level,
    trustOverall: args.trust,
  });
  const learnedThresholds = buildEffectiveThresholdMap({ learned: args.learned, relaxThresholds });
  return enforceAgentApprovalMode({
    mode,
    action: args.action,
    confidence: args.confidence,
    learnedThresholds,
  });
}

describe("background loop composition", () => {
  it("AC-1: learned 0.6 reaches the core — contact-update @0.65 under autonomous → allowed", () => {
    const r = loopDecision({
      level: "autonomous",
      trust: 50,
      learned: { "contact-update": 0.6 },
      action: "contact-update",
      confidence: 0.65,
    });
    expect(r.allowed).toBe(true);
  });

  it("EC-5: without the learned key, 0.65 < static 0.75 → not allowed", () => {
    const r = loopDecision({
      level: "autonomous",
      trust: 50,
      learned: {},
      action: "contact-update",
      confidence: 0.65,
    });
    expect(r.allowed).toBe(false);
  });

  it("AC-6 through the loop: email-send @0.99 with a forged learned 0.0 → not allowed (ceiling-forced)", () => {
    const r = loopDecision({
      level: "strategic",
      trust: 100,
      learned: { "email-send": 0.0 },
      action: "email-send",
      confidence: 0.99,
    });
    expect(r.allowed).toBe(false);
    expect(r.queueAs).toBe("pending-per-item");
  });
});
