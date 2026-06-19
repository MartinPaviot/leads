/**
 * CLE-16 T5/T6 — bounded incremental learning + CLE-11 bad signal.
 *   AC-2  good-rate ≥0.8 / ≥10 ⇒ drops from prev, floored 0.5
 *   AC-3  good-rate <0.5 ⇒ rises from prev, ceilinged 1.0
 *   EC-2  dead-band [0.5, 0.8) ⇒ no move
 *   AC-21/EC-1  <10 outcomes ⇒ static, no NaN
 *   §3.2  incremental-from-prev convergence over repeated windows
 *   AC-19 a reverted/canceled row counts bad; good-then-reverted nets bad
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTenantSettings = vi.fn();
const mockUpdateTenantSettings = vi.fn();

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...a: unknown[]) => mockGetTenantSettings(...a),
  updateTenantSettings: (...a: unknown[]) => mockUpdateTenantSettings(...a),
}));

const selectResults: unknown[][] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve(selectResults.shift() ?? []),
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

import { recalculateThresholds, computeEffectiveThresholds, getEffectiveThreshold } from "@/lib/guardrails/learned-trust";

/** Queue: action_outcomes rows, then tool_call_events rows, then outbound count. */
function queue(outcomes: unknown[], reverted: unknown[] = [], outboundBad = 0) {
  selectResults.length = 0;
  selectResults.push(outcomes);
  selectResults.push(reverted);
  selectResults.push([{ n: outboundBad }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateTenantSettings.mockResolvedValue(undefined);
});

describe("recalculateThresholds — bounded incremental update", () => {
  it("AC-2: good-rate ≥0.8 over ≥10 drops from prev (static 0.75 → 0.70)", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    queue([{ actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 18 }]);
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.7);
  });

  it("AC-3: good-rate <0.5 rises from prev (static 0.75 → 0.80)", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    queue([{ actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 4 }]);
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.8);
  });

  it("EC-2: dead-band [0.5, 0.8) ⇒ no move", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: { "contact-update": 0.65 } });
    queue([{ actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 13 }]); // 0.65 rate
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.65);
  });

  it("AC-21/EC-1: <10 outcomes ⇒ stays at prev (static), no NaN", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    queue([{ actionType: "contact-update", totalOutcomes: 5, positiveOutcomes: 5 }]);
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.75);
    expect(Number.isNaN(r["contact-update"])).toBe(false);
  });

  it("AC-2 floor: sustained good outcomes walk down toward, but never past, 0.5", async () => {
    let learned: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      mockGetTenantSettings.mockResolvedValue({ learnedThresholds: learned });
      queue([{ actionType: "contact-update", totalOutcomes: 50, positiveOutcomes: 50 }]);
      learned = await recalculateThresholds("t1");
    }
    expect(learned["contact-update"]).toBe(0.5); // converged to floor, not below
  });

  it("AC-3 ceiling: sustained bad outcomes walk up toward, but never past, 1.0", async () => {
    let learned: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      mockGetTenantSettings.mockResolvedValue({ learnedThresholds: learned });
      queue([{ actionType: "contact-update", totalOutcomes: 50, positiveOutcomes: 0 }]);
      learned = await recalculateThresholds("t1");
    }
    expect(learned["contact-update"]).toBe(1.0);
  });

  it("incremental-from-prev: a learned 0.6 + good rate drops to 0.55 (not re-derived from base)", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: { "contact-update": 0.6 } });
    queue([{ actionType: "contact-update", totalOutcomes: 30, positiveOutcomes: 30 }]);
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.55);
  });
});

describe("recalculateThresholds — CLE-11 reversal/bounce bad signal (AC-19)", () => {
  it("a reverted contact-update row counts bad and raises the bar", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    // 10 good F003 outcomes BUT 20 reversals (updateContact → contact-update):
    // total becomes 30, good 10 → rate 0.33 (<0.5) → raise from 0.75 to 0.80.
    queue(
      [{ actionType: "contact-update", totalOutcomes: 10, positiveOutcomes: 10 }],
      [{ toolName: "updateContact", n: 20 }],
      0,
    );
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.8);
  });

  it("good-then-reverted nets bad: all-good F003 + reversals drops the good-rate below 0.8", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    // 12 good + 12 reverted → 24 total, 12 good → rate 0.5 → dead-band, NO drop
    // (would have dropped without the reversal signal). Reversal cancels the
    // would-be reward.
    queue(
      [{ actionType: "contact-update", totalOutcomes: 12, positiveOutcomes: 12 }],
      [{ toolName: "updateContact", n: 12 }],
      0,
    );
    const r = await recalculateThresholds("t1");
    expect(r["contact-update"]).toBe(0.75); // no drop — reversal neutralized the good outcomes
  });

  it("outbound canceled/bounced are counted but never produce a learned key (excluded)", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    queue([], [], 30); // 30 canceled/bounced → maps to email-send (excluded)
    const r = await recalculateThresholds("t1");
    expect(r["email-send"]).toBeUndefined();
  });
});

describe("read-path clamp (EC-5)", () => {
  it("computeEffectiveThresholds clamps an out-of-range learned value", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: { "contact-update": 0.1, "task-create": 1.5 } });
    const eff = await computeEffectiveThresholds("t1");
    expect(eff["contact-update"]).toBe(0.5);
    expect(eff["task-create"]).toBe(1.0);
  });

  it("getEffectiveThreshold clamps a NaN learned value to ceiling", () => {
    expect(getEffectiveThreshold("contact-update", { "contact-update": NaN })).toBe(1.0);
    expect(getEffectiveThreshold("contact-update", { "contact-update": 0.6 })).toBe(0.6);
    expect(getEffectiveThreshold("contact-update")).toBe(0.75); // static fallback
  });
});
