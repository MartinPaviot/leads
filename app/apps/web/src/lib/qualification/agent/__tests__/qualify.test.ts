import { describe, it, expect, vi } from "vitest";
import { qualifyFit, verdictToFitInput, type AgentVerdict, type QualifyDeps, type RunAgentResultLike } from "../qualify";

const account = (over: Partial<{ id: string; domain: string | null; passedCheapFilters: boolean }> = {}) =>
  ({ id: "a1", domain: "acme.fr", passedCheapFilters: true, ...over });

function deps(result?: RunAgentResultLike) {
  const runAgent = vi.fn(async () => result ?? ({ evalPassed: true, value: { verdict: "pass", evidence: [{ url: "https://acme.fr/pricing", quote: "per-seat SaaS pricing" }], confidence: 0.9 } } as RunAgentResultLike));
  return { deps: { tenantId: "t1", runAgent } as QualifyDeps, runAgent };
}

describe("qualifyFit — cheap-filter gate (AC2)", () => {
  it("refuses to run the agent on an un-filtered account", async () => {
    const { deps: d, runAgent } = deps();
    const v = await qualifyFit(account({ passedCheapFilters: false }), "is actually SaaS", d);
    expect(v.verdict).toBe("needs-review");
    expect(runAgent).not.toHaveBeenCalled();
  });
  it("needs-review with no website", async () => {
    const { deps: d, runAgent } = deps();
    expect((await qualifyFit(account({ domain: null }), "q", d)).verdict).toBe("needs-review");
    expect(runAgent).not.toHaveBeenCalled();
  });
});

describe("qualifyFit — runs the governed agent (AC1/AC4)", () => {
  it("calls runAgent once with the fit-qualification kind + a stable request id", async () => {
    const { deps: d, runAgent } = deps();
    await qualifyFit(account(), "is actually SaaS", d);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ kind: "fit-qualification", requestId: "qualify:a1:is-actually-saas" }));
  });
  it("returns a grounded pass/fail verdict", async () => {
    const { deps: d } = deps();
    expect((await qualifyFit(account(), "saas", d)).verdict).toBe("pass");
    const fail = deps({ evalPassed: true, value: { verdict: "fail", evidence: [{ url: "u", quote: "agency, not SaaS" }], confidence: 0.8 } });
    expect((await qualifyFit(account(), "saas", fail.deps)).verdict).toBe("fail");
  });
});

describe("qualifyFit — eval gate + grounding (AC5/AC3)", () => {
  it("eval-fail → needs-review", async () => {
    const { deps: d } = deps({ evalPassed: false, reason: "policy violation" });
    const v = await qualifyFit(account(), "saas", d);
    expect(v.verdict).toBe("needs-review");
    expect(v.reason).toContain("policy");
  });
  it("a verdict with no citations is downgraded to needs-review (cite-or-abstain)", async () => {
    const { deps: d } = deps({ evalPassed: true, value: { verdict: "pass", evidence: [], confidence: 0.8 } });
    expect((await qualifyFit(account(), "saas", d)).verdict).toBe("needs-review");
  });
});

describe("verdictToFitInput (AC4)", () => {
  it("maps the verdict to a deterministic fit-criterion input", () => {
    expect(verdictToFitInput({ verdict: "pass", evidence: [], confidence: 1 })).toEqual({ operable: true, matched: true, exclude: false });
    expect(verdictToFitInput({ verdict: "fail", evidence: [], confidence: 1 })).toEqual({ operable: true, matched: false, exclude: true });
    expect(verdictToFitInput({ verdict: "needs-review", evidence: [], confidence: 0 })).toEqual({ operable: false, matched: false, exclude: false });
  });
});
