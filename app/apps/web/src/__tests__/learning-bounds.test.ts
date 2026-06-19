/**
 * CLE-16 T3 (REQUIRED — the headline safety AC). Money / destructive / outbound
 * NEVER auto-execute, regardless of learning or level. (AC-4 / AC-5 / AC-6)
 *
 * Proven end to end through the real composition with an injected/learned
 * threshold of 0.0 for the paid, destructive, AND outbound classes, across ALL
 * levels (incl. strategic @ trust 100) at confidence 1. Plus: the learner
 * writes NO key for the hard-excluded outbound classes (AC-7).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks for the recalculateThresholds AC-7 leg ───────────────
const mockGetTenantSettings = vi.fn();
const mockUpdateTenantSettings = vi.fn();

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...a: unknown[]) => mockGetTenantSettings(...a),
  updateTenantSettings: (...a: unknown[]) => mockUpdateTenantSettings(...a),
}));

// db.select() chain — returns the queued result set per call.
const selectResults: unknown[][] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve(selectResults.shift() ?? []),
          // outbound bad-signal query ends at .where (no groupBy)
          then: (res: (v: unknown) => void) => res(selectResults.shift() ?? []),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  actionOutcomes: { tenantId: "tenant_id", actionType: "action_type", status: "status", positivity: "positivity" },
  toolCallEvents: { tenantId: "tenant_id", toolName: "tool_name", status: "status" },
  outboundEmails: { tenantId: "tenant_id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  sql: Object.assign((..._a: unknown[]) => ({ as: () => ({}) }), { as: () => ({}) }),
  inArray: (...a: unknown[]) => a,
}));

import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";
import { resolveEffectiveMode, type GuardedAction } from "@/lib/guardrails/approval-mode";
import { buildEffectiveThresholdMap, HARD_EXCLUDED_ACTIONS } from "@/lib/guardrails/level-behavior";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

const ALL_LEVELS: Array<{ level: AutonomyLevel; trust: number }> = [
  { level: "copilot", trust: 100 },
  { level: "guided", trust: 100 },
  { level: "autonomous", trust: 100 },
  { level: "strategic", trust: 100 }, // relaxed bars active
];

/** Inject 0.0 for EVERY action via a hand-built map (bypasses the builder's
 *  ceiling-force to prove the CORE itself refuses, even if a forged map slipped
 *  a 0.0 through). */
function forced0Map(): Record<string, number> {
  return {
    "email-send": 0,
    "email-reply": 0,
    "contact-create": 0,
    "contact-update": 0,
    "deal-stage-change": 0,
    "task-create": 0,
    "sequence-enrollment": 0,
  };
}

const PAID: DecideActionInput["action"] = { mutating: true, outbound: false, reversible: true, cost: "money", confirm: "never" };
const DESTRUCTIVE: DecideActionInput["action"] = { mutating: true, outbound: false, reversible: false, cost: "free", confirm: "never" };
const OUTBOUND: DecideActionInput["action"] = { mutating: true, outbound: true, reversible: false, cost: "free", confirm: "never" };

describe("HARD RULE — money/destructive/outbound never auto-execute (AC-4/5/6)", () => {
  for (const { level, trust } of ALL_LEVELS) {
    const { mode } = resolveEffectiveMode({ settings: { agentApprovalMode: "review-each" }, level, trustOverall: trust });

    it(`${level}: paid action @ confidence 1 with forced 0.0 → confirm`, () => {
      const d = decideAction(
        { action: PAID, approvalMode: mode, role: "member", confidence: 1 },
        { actionKey: "contact-update", learnedThresholds: forced0Map() },
      );
      expect(d.disposition).toBe("confirm");
    });

    it(`${level}: destructive action @ confidence 1 with forced 0.0 → confirm`, () => {
      const d = decideAction(
        { action: DESTRUCTIVE, approvalMode: mode, role: "member", confidence: 1 },
        { actionKey: "contact-update", learnedThresholds: forced0Map() },
      );
      expect(d.disposition).toBe("confirm");
    });

    it(`${level}: outbound action @ confidence 1 with forced 0.0 → confirm`, () => {
      const d = decideAction(
        { action: OUTBOUND, approvalMode: mode, role: "member", confidence: 1 },
        { actionKey: "email-send", learnedThresholds: forced0Map() },
      );
      expect(d.disposition).toBe("confirm");
    });
  }

  it("the builder additionally ceiling-forces excluded classes (defense-in-depth)", () => {
    const map = buildEffectiveThresholdMap({ learned: forced0Map(), relaxThresholds: true });
    for (const a of HARD_EXCLUDED_ACTIONS) expect(map[a as GuardedAction]).toBe(1.0);
  });
});

describe("recalculateThresholds writes NO key for hard-excluded classes (AC-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
  });

  it("given outcome rows for email-send/email-reply/sequence-enrollment, no learned key is written for them", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    mockUpdateTenantSettings.mockResolvedValue(undefined);

    // 1st select (action_outcomes groupBy): excluded classes + one allowed class
    selectResults.push([
      { actionType: "email-send", totalOutcomes: 20, positiveOutcomes: 20 },
      { actionType: "email-reply", totalOutcomes: 20, positiveOutcomes: 20 },
      { actionType: "sequence-enrollment", totalOutcomes: 20, positiveOutcomes: 20 },
      { actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 20 },
    ]);
    // 2nd select (tool_call_events reverted groupBy): none
    selectResults.push([]);
    // 3rd select (outbound_emails canceled/bounced — .then): none
    selectResults.push([{ n: 0 }]);

    const { recalculateThresholds } = await import("@/lib/guardrails/learned-trust");
    const result = await recalculateThresholds("t1");

    expect(result["email-send"]).toBeUndefined();
    expect(result["email-reply"]).toBeUndefined();
    expect(result["sequence-enrollment"]).toBeUndefined();
    // the allowed class IS written (good rate ≥0.8 lowers it from static 0.75)
    expect(result["contact-update"]).toBeLessThan(0.75);

    const written = mockUpdateTenantSettings.mock.calls[0][1].learnedThresholds;
    expect(Object.keys(written)).not.toContain("email-send");
    expect(Object.keys(written)).not.toContain("email-reply");
    expect(Object.keys(written)).not.toContain("sequence-enrollment");
  });

  it("normalizes the PRODUCTION F003 vocab: outbound verbs stay excluded; create_task -> task-create learns", async () => {
    // The agent-reactor writes action_outcomes.actionType in F003 vocab
    // (send_followup / enroll_sequence / create_task), NOT GuardedAction names.
    // The learner must normalize so (a) the exclusion bites on real outbound rows
    // and (b) a learnable bar lands under the GuardedAction key the core reads.
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    mockUpdateTenantSettings.mockResolvedValue(undefined);
    selectResults.push([
      { actionType: "send_followup", totalOutcomes: 20, positiveOutcomes: 20 },   // -> email-send (excluded)
      { actionType: "enroll_sequence", totalOutcomes: 20, positiveOutcomes: 20 }, // -> sequence-enrollment (excluded)
      { actionType: "create_task", totalOutcomes: 20, positiveOutcomes: 20 },     // -> task-create (learnable)
    ]);
    selectResults.push([]); // reverted tool_call_events: none
    selectResults.push([{ n: 0 }]); // outbound bad: none

    const { recalculateThresholds } = await import("@/lib/guardrails/learned-trust");
    const result = await recalculateThresholds("t1");

    // Outbound F003 verbs normalize to hard-excluded classes -> no key under EITHER name.
    expect(result["send_followup"]).toBeUndefined();
    expect(result["email-send"]).toBeUndefined();
    expect(result["enroll_sequence"]).toBeUndefined();
    expect(result["sequence-enrollment"]).toBeUndefined();
    // create_task normalizes to task-create -> the learned key lands under the
    // GuardedAction name buildEffectiveThresholdMap/decideAction actually read, and
    // a good rate lowered it below the static 0.7.
    expect(result["create_task"]).toBeUndefined();
    expect(result["task-create"]).toBeDefined();
    expect(result["task-create"]).toBeLessThan(0.7);
  });
});
