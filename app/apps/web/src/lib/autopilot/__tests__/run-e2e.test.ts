/**
 * Spec 37 (B5.2) — flag-gated end-to-end + idempotency for the autopilot loop.
 * Drives runAutopilotForTenant against a STATEFUL in-memory harness (enrollments
 * persist between runs; spentToday + alreadyEnrolled reflect that state) so a
 * double-run proves the loop never double-enrolls — the same two guards the real
 * cron relies on (per-day spend + the already-enrolled exclusion).
 */
import { describe, it, expect, afterEach } from "vitest";
import { runAutopilotForTenant, type RunAutopilotDeps } from "../run";
import type { ProspectCandidate } from "../select";
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import { isDailyAutopilotEnabled } from "../flag";

const cand = (id: string, score: number): ProspectCandidate => ({
  contactId: id, companyId: `co-${id}`, priorityScore: score, priorityScoreComputedAt: 0, reachable: true,
});

// ── The deployment flag gate ──
describe("isDailyAutopilotEnabled — deployment gate (default OFF)", () => {
  const prev = process.env.DAILY_AUTOPILOT_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.DAILY_AUTOPILOT_ENABLED;
    else process.env.DAILY_AUTOPILOT_ENABLED = prev;
  });

  it("off when unset — the cron no-ops by default", () => {
    delete process.env.DAILY_AUTOPILOT_ENABLED;
    expect(isDailyAutopilotEnabled()).toBe(false);
  });
  it("on for '1'", () => {
    process.env.DAILY_AUTOPILOT_ENABLED = "1";
    expect(isDailyAutopilotEnabled()).toBe(true);
  });
  it("on for 'true'", () => {
    process.env.DAILY_AUTOPILOT_ENABLED = "true";
    expect(isDailyAutopilotEnabled()).toBe(true);
  });
  it.each(["0", "false", "yes", "TRUE", "on", ""])("off for %p (strict — only '1'/'true')", (v) => {
    process.env.DAILY_AUTOPILOT_ENABLED = v;
    expect(isDailyAutopilotEnabled()).toBe(false);
  });
});

// ── Stateful e2e harness: enrollments persist across runs ──
function harness(opts: { configBudget: number; approvalMode: ApprovalModeV2; candidates: ProspectCandidate[] }) {
  const enrolled = new Set<string>();
  const deps: RunAutopilotDeps = {
    loadCapacity: async () => ({ byMailbox: [], totalAvailable: 1000, byProvider: {} }),
    getConfig: async () => ({ configBudget: opts.configBudget, maxEmailsPerDay: null, approvalMode: opts.approvalMode }),
    spentToday: async () => enrolled.size, // the per-day spend, reflecting prior runs
    getActiveSequenceId: async () => "seq1",
    loadCandidates: async () => ({
      candidates: opts.candidates,
      alreadyEnrolledContactIds: new Set(enrolled), // grows as we enroll → re-run excludes them
      suppressedContactIds: new Set<string>(),
    }),
    prepare: async () => ({}),
    enroll: async ({ contactId, action }) => {
      if (action === "auto") { enrolled.add(contactId); return { outcome: "enrolled" as const }; }
      return { outcome: "drafted" as const };
    },
  };
  return { deps, enrolled };
}

describe("runAutopilotForTenant — e2e across approval modes", () => {
  it("auto-high-confidence: a single run enrolls the whole selected set", async () => {
    const { deps, enrolled } = harness({ configBudget: 100, approvalMode: "auto-high-confidence", candidates: [cand("a", 90), cand("b", 80), cand("d", 70)] });
    const s = await runAutopilotForTenant("t1", deps);
    expect(s).toMatchObject({ selected: 3, prepared: 3, enrolled: 3, drafted: 0, errors: 0 });
    expect([...enrolled].sort()).toEqual(["a", "b", "d"]);
  });

  it("review-each: drafts the selected set, auto-enrolls nothing", async () => {
    const { deps, enrolled } = harness({ configBudget: 100, approvalMode: "review-each", candidates: [cand("a", 9), cand("b", 8)] });
    const s = await runAutopilotForTenant("t1", deps);
    expect(s).toMatchObject({ selected: 2, enrolled: 0, drafted: 2 });
    expect(enrolled.size).toBe(0);
  });

  it("batch-daily: drafts too (queued for the daily review)", async () => {
    const { deps, enrolled } = harness({ configBudget: 100, approvalMode: "batch-daily", candidates: [cand("a", 9), cand("b", 8)] });
    const s = await runAutopilotForTenant("t1", deps);
    expect(s).toMatchObject({ selected: 2, enrolled: 0, drafted: 2 });
    expect(enrolled.size).toBe(0);
  });
});

describe("runAutopilotForTenant — idempotency (a second same-day run never double-enrolls)", () => {
  it("via the already-enrolled exclusion (budget still open)", async () => {
    const { deps, enrolled } = harness({ configBudget: 100, approvalMode: "auto-high-confidence", candidates: [cand("a", 90), cand("b", 80), cand("d", 70)] });
    const first = await runAutopilotForTenant("t1", deps);
    expect(first.enrolled).toBe(3);

    const second = await runAutopilotForTenant("t1", deps); // budget = 100 − 3 = 97 (open), but every candidate is now enrolled
    expect(second.skipped).toBe("no_candidates");
    expect(second.enrolled).toBe(0);
    expect(enrolled.size).toBe(3); // still exactly the first run's three
  });

  it("via the per-day budget (spent == configured target)", async () => {
    const { deps, enrolled } = harness({ configBudget: 3, approvalMode: "auto-high-confidence", candidates: [cand("a", 9), cand("b", 8), cand("d", 7), cand("e", 6), cand("f", 5)] });
    const first = await runAutopilotForTenant("t1", deps);
    expect(first).toMatchObject({ budget: 3, selected: 3, enrolled: 3 });

    const second = await runAutopilotForTenant("t1", deps); // spentToday 3 == configBudget 3 → nothing left
    expect(second.skipped).toBe("budget_zero");
    expect(enrolled.size).toBe(3); // the remaining e/f are NOT enrolled in the same day
  });
});
