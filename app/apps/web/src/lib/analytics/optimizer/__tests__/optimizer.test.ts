import { describe, it, expect, vi } from "vitest";
import {
  routeProposal,
  isValidProposal,
  runWeeklyReview,
  type Proposal,
  type ReviewDeps,
  type ReviewAgentResult,
  type AuditEntry,
} from "../index";

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: over.id ?? "p1",
  type: over.type ?? "scale",
  target: over.target ?? "camp1",
  rationale: over.rationale ?? "reply rate above benchmark",
  risk: over.risk ?? "low",
  citedMetric: over.citedMetric ?? { name: "replyRate", value: 0.08, scope: "camp1" },
  ...over,
});

describe("routeProposal — AC2 risk routing", () => {
  it("low risk on an autonomous campaign → auto_apply", () => {
    expect(routeProposal(proposal({ risk: "low" }), { autonomous: true })).toMatchObject({ route: "auto_apply", applied: true });
  });
  it("low risk on a non-autonomous campaign → gated", () => {
    expect(routeProposal(proposal({ risk: "low" }), { autonomous: false })).toMatchObject({ route: "gated", applied: false });
  });
  it("medium and high risk always → gated, even when autonomous", () => {
    expect(routeProposal(proposal({ risk: "medium" }), { autonomous: true }).route).toBe("gated");
    expect(routeProposal(proposal({ risk: "high" }), { autonomous: true }).route).toBe("gated");
  });
});

describe("routeProposal — AC3 watch on weak data + AC4 cite guard", () => {
  it("a proposal with no cited metric → watch", () => {
    expect(routeProposal(proposal({ citedMetric: undefined }), { autonomous: true }).route).toBe("watch");
  });
  it("an insignificant significance verdict → watch (never applied)", () => {
    for (const verdict of ["insufficient_data", "no_significant_difference", "inconclusive"] as const) {
      const d = routeProposal(proposal({ risk: "low", significanceVerdict: verdict }), { autonomous: true });
      expect(d.route).toBe("watch");
      expect(d.applied).toBe(false);
    }
  });
  it("a 'winner' verdict is allowed to route normally", () => {
    expect(routeProposal(proposal({ risk: "low", significanceVerdict: "winner" }), { autonomous: true }).route).toBe("auto_apply");
  });
});

describe("isValidProposal", () => {
  it("accepts a well-formed proposal and rejects bad type/risk", () => {
    expect(isValidProposal(proposal())).toBe(true);
    expect(isValidProposal({ ...proposal(), type: "delete" as never })).toBe(false);
    expect(isValidProposal({ ...proposal(), risk: "extreme" as never })).toBe(false);
    expect(isValidProposal(null)).toBe(false);
  });
});

function deps(over: Partial<ReviewDeps> = {}): { deps: ReviewDeps; audits: AuditEntry[]; applied: string[] } {
  const audits: AuditEntry[] = [];
  const applied: string[] = [];
  return {
    audits,
    applied,
    deps: {
      runAgent: vi.fn(async (): Promise<ReviewAgentResult> => ({ evalPassed: true, value: { proposals: [proposal()] } })),
      isAutonomous: () => true,
      applyChange: async (p) => void applied.push(p.id),
      audit: (e) => void audits.push(e),
      ...over,
    },
  };
}

describe("runWeeklyReview — AC1/AC4/AC5", () => {
  it("applies a low-risk autonomous proposal and audits it", async () => {
    const { deps: d, audits } = deps();
    const r = await runWeeklyReview("ws1", d);
    expect(r.evalPassed).toBe(true);
    expect(r.applied).toEqual(["p1"]);
    expect(audits[0]).toMatchObject({ decision: { route: "auto_apply" }, outcome: { ok: true } });
  });

  it("a failed agent eval yields no proposals (AC4)", async () => {
    const { deps: d } = deps({ runAgent: async () => ({ evalPassed: false, reason: "ungrounded" }) });
    const r = await runWeeklyReview("ws1", d);
    expect(r).toMatchObject({ evalPassed: false, proposals: [], applied: [] });
  });

  it("an agent throw is handled (no proposals)", async () => {
    const { deps: d } = deps({ runAgent: async () => { throw new Error("model down"); } });
    expect((await runWeeklyReview("ws1", d)).evalPassed).toBe(false);
  });

  it("medium/high proposals are gated, not applied, but still audited", async () => {
    const { deps: d, audits, applied } = deps({
      runAgent: async () => ({ evalPassed: true, value: { proposals: [proposal({ id: "p2", risk: "high" })] } }),
    });
    const r = await runWeeklyReview("ws1", d);
    expect(applied).toEqual([]);
    expect(r.decisions[0].route).toBe("gated");
    expect(audits).toHaveLength(1);
  });

  it("filters out invalid proposals from the agent", async () => {
    const { deps: d } = deps({
      runAgent: async () => ({ evalPassed: true, value: { proposals: [proposal(), { id: "bad", type: "nuke" } as never] } }),
    });
    const r = await runWeeklyReview("ws1", d);
    expect(r.proposals.map((p) => p.id)).toEqual(["p1"]);
  });

  it("records a failed apply outcome without throwing", async () => {
    const { deps: d, audits } = deps({ applyChange: async () => { throw new Error("apply failed"); } });
    const r = await runWeeklyReview("ws1", d);
    expect(r.applied).toEqual([]);
    expect(audits[0].outcome).toMatchObject({ ok: false, error: "apply failed" });
  });
});
