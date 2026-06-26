import { describe, it, expect, vi } from "vitest";
import { runAutopilotForTenant, type RunAutopilotDeps } from "../run";
import type { ProspectCandidate } from "../select";

const cand = (id: string, score: number): ProspectCandidate => ({
  contactId: id, companyId: `co-${id}`, priorityScore: score, priorityScoreComputedAt: 0, reachable: true,
});

const pool = (cands: ProspectCandidate[], enrolled: string[] = [], suppressed: string[] = []) => ({
  candidates: cands, alreadyEnrolledContactIds: new Set(enrolled), suppressedContactIds: new Set(suppressed),
});

function deps(over: Partial<RunAutopilotDeps> = {}): { deps: RunAutopilotDeps; prepare: ReturnType<typeof vi.fn>; enroll: ReturnType<typeof vi.fn> } {
  const prepare = vi.fn(async () => ({}));
  const enroll = vi.fn(async () => ({ outcome: "enrolled" as const }));
  return {
    prepare, enroll,
    deps: {
      loadCapacity: async () => ({ byMailbox: [], totalAvailable: 100, byProvider: {} }),
      getConfig: async () => ({ configBudget: 100, maxEmailsPerDay: null, approvalMode: "auto-high-confidence" }),
      spentToday: async () => 0,
      getActiveSequenceId: async () => "seq1",
      loadCandidates: async () => pool([cand("a", 90), cand("b", 80), cand("d", 70)]),
      prepare, enroll,
      ...over,
    },
  };
}

describe("runAutopilotForTenant — skip dispositions", () => {
  it("no sendable capacity → no_capacity, nothing prepared/enrolled", async () => {
    const { deps: d, prepare, enroll } = deps({ loadCapacity: async () => ({ byMailbox: [], totalAvailable: 0, byProvider: {} }) });
    const s = await runAutopilotForTenant("t1", d);
    expect(s.skipped).toBe("no_capacity");
    expect(prepare).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });

  it("budget resolves to 0 (already spent today) → budget_zero", async () => {
    const { deps: d } = deps({ spentToday: async () => 100 });
    expect((await runAutopilotForTenant("t1", d)).skipped).toBe("budget_zero");
  });

  it("paused tenant → 'paused', gated before any capacity/spend work", async () => {
    const loadCapacity = vi.fn(async () => ({ byMailbox: [], totalAvailable: 100, byProvider: {} }));
    const spentToday = vi.fn(async () => 0);
    const { deps: d, prepare } = deps({
      getConfig: async () => ({ configBudget: 100, maxEmailsPerDay: null, approvalMode: "auto-high-confidence", autopilotPaused: true }),
      loadCapacity,
      spentToday,
    });
    const s = await runAutopilotForTenant("t1", d);
    expect(s.skipped).toBe("paused");
    expect(loadCapacity).not.toHaveBeenCalled(); // the kill-switch short-circuits first
    expect(spentToday).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("no active sequence → no_active_sequence", async () => {
    const { deps: d } = deps({ getActiveSequenceId: async () => null });
    expect((await runAutopilotForTenant("t1", d)).skipped).toBe("no_active_sequence");
  });

  it("no candidates after exclusions → no_candidates", async () => {
    const { deps: d } = deps({ loadCandidates: async () => pool([cand("a", 9)], ["a"]) }); // the only candidate is already enrolled
    expect((await runAutopilotForTenant("t1", d)).skipped).toBe("no_candidates");
  });
});

describe("runAutopilotForTenant — enroll loop", () => {
  it("auto mode: enrolls the selected set, prepares each first", async () => {
    const { deps: d, prepare, enroll } = deps();
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ selected: 3, enrolled: 3, drafted: 0 });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", sequenceId: "seq1", action: "auto" }));
  });

  it("review/batch mode → drafts (no auto-enroll)", async () => {
    const enroll = vi.fn(async () => ({ outcome: "drafted" as const }));
    const { deps: d } = deps({ getConfig: async () => ({ configBudget: 100, maxEmailsPerDay: null, approvalMode: "review-each" }), enroll });
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ enrolled: 0, drafted: 3 });
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ action: "draft" }));
  });

  it("routes each prospect to its resolved sequence (per-prospect); falls back to the active one", async () => {
    const { deps: d, enroll } = deps({
      resolveSequenceId: async (_t, companyId) => (companyId === "co-a" ? "post-funding" : null),
    });
    await runAutopilotForTenant("t1", d);
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ contactId: "a", sequenceId: "post-funding" }));
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ contactId: "b", sequenceId: "seq1" })); // unresolved → fallback
  });

  it("a resolveSequenceId failure falls back to the active sequence, never aborts", async () => {
    const { deps: d, enroll } = deps({ resolveSequenceId: async () => { throw new Error("router down"); } });
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ enrolled: 3 });
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: "seq1" }));
  });

  it("budget caps the selected set (partial when fewer than the pool)", async () => {
    const { deps: d, prepare } = deps({
      getConfig: async () => ({ configBudget: 2, maxEmailsPerDay: null, approvalMode: "auto-high-confidence" }),
      loadCandidates: async () => pool([cand("a", 9), cand("b", 8), cand("d", 7), cand("e", 6)]),
    });
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ budget: 2, selected: 2, enrolled: 2 });
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("budget is clamped to capacity (warmup-safe), not the config", async () => {
    const { deps: d } = deps({
      loadCapacity: async () => ({ byMailbox: [], totalAvailable: 1, byProvider: {} }),
      loadCandidates: async () => pool([cand("a", 9), cand("b", 8)]),
    });
    expect((await runAutopilotForTenant("t1", d))).toMatchObject({ budget: 1, selected: 1, enrolled: 1 });
  });

  it("an anti-collision skip (enroll outcome 'collision') counts as neither enrolled nor drafted", async () => {
    const enroll = vi.fn().mockResolvedValueOnce({ outcome: "enrolled" }).mockResolvedValue({ outcome: "collision" });
    const { deps: d } = deps({ enroll });
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ selected: 3, enrolled: 1, drafted: 0 });
  });
});

describe("runAutopilotForTenant — cost bound + fault isolation (B6.1)", () => {
  it("prepared (the LLM-call count) never exceeds the budget", async () => {
    const { deps: d } = deps({
      getConfig: async () => ({ configBudget: 2, maxEmailsPerDay: null, approvalMode: "auto-high-confidence" }),
      loadCandidates: async () => pool([cand("a", 9), cand("b", 8), cand("d", 7), cand("e", 6)]),
    });
    const s = await runAutopilotForTenant("t1", d);
    expect(s.prepared).toBe(2);
    expect(s.prepared).toBeLessThanOrEqual(s.budget);
  });

  it("isolates a mid-loop prepare failure — the other prospects still enroll", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("llm hiccup")).mockResolvedValue({});
    const { deps: d, enroll } = deps({ prepare });
    const s = await runAutopilotForTenant("t1", d); // 3 candidates, the first (top score) fails prepare
    expect(s).toMatchObject({ selected: 3, prepared: 2, enrolled: 2, errors: 1 });
    expect(enroll).toHaveBeenCalledTimes(2); // a failed prepare short-circuits before enroll
  });

  it("trips the breaker after N consecutive failures — stops burning calls", async () => {
    const prepare = vi.fn().mockRejectedValue(new Error("budget exhausted"));
    const { deps: d } = deps({
      prepare,
      maxConsecutiveErrors: 2,
      getConfig: async () => ({ configBudget: 100, maxEmailsPerDay: null, approvalMode: "auto-high-confidence" }),
      loadCandidates: async () => pool([cand("a", 9), cand("b", 8), cand("d", 7), cand("e", 6)]),
    });
    const s = await runAutopilotForTenant("t1", d);
    expect(s).toMatchObject({ selected: 4, prepared: 0, enrolled: 0, errors: 2 });
    expect(prepare).toHaveBeenCalledTimes(2); // bailed after 2 of 4, didn't process the rest
  });
});
