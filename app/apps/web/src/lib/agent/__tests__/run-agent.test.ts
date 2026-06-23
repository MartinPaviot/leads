import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runAgent } from "../run-agent";
import { makeWorkspaceToolResolver } from "../default-deps";
import { CrossTenantToolError, type RunAgentDeps, type AgentRunRow, type ModelCallResult } from "../types";

const schema = z.object({ ok: z.boolean() });

function mk(over: Partial<RunAgentDeps> = {}) {
  const logged: AgentRunRow[] = [];
  const meterCalls: unknown[] = [];
  const deps: RunAgentDeps = {
    callModel: over.callModel ?? (async (): Promise<ModelCallResult> => ({ rawText: '{"ok":true}', inputTokens: 10, outputTokens: 5, toolsCalled: [] })),
    resolveTools: over.resolveTools ?? makeWorkspaceToolResolver({ t1: { searchAccounts: {} } }),
    runEval: over.runEval ?? (async () => ({ passed: true, score: 0.9, reason: "grounded" })),
    meter: over.meter ?? (async (op, fn) => { meterCalls.push(op); return fn(); }),
    logRun: over.logRun ?? (async (row) => { logged.push(row); }),
    findRun: over.findRun ?? (async () => null),
  };
  return { deps, logged, meterCalls };
}

const base = { tenantId: "t1", kind: "demo", requestId: "r1", input: "hello", schema, tools: ["searchAccounts"] };

describe("runAgent — happy path (AC1/AC2/AC3)", () => {
  it("returns the validated value, meters the call, logs the run", async () => {
    const { deps, logged, meterCalls } = mk();
    const r = await runAgent(deps, base);
    expect(r.evalPassed).toBe(true);
    if (r.evalPassed) expect(r.value).toEqual({ ok: true });
    expect(meterCalls.length).toBe(1); // metered (AC2)
    expect(logged.length).toBe(1); // logged (AC3)
    expect(logged[0].evalPassed).toBe(true);
  });
});

describe("runAgent — schema repair-or-fail (AC1)", () => {
  it("repairs invalid output on a second attempt", async () => {
    let attempt = -1;
    const callModel = vi.fn(async (): Promise<ModelCallResult> => {
      attempt++;
      return { rawText: attempt === 0 ? "not json" : '{"ok":true}', inputTokens: 4, outputTokens: 2, toolsCalled: [] };
    });
    const { deps } = mk({ callModel });
    const r = await runAgent(deps, base);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(r.evalPassed && r.value).toEqual({ ok: true });
  });

  it("never returns a usable result when output stays invalid (repair exhausted)", async () => {
    const callModel = async (): Promise<ModelCallResult> => ({ rawText: "still not json", inputTokens: 1, outputTokens: 1, toolsCalled: [] });
    const { deps, logged } = mk({ callModel });
    const r = await runAgent(deps, base);
    expect(r.evalPassed).toBe(false);
    expect("value" in r).toBe(false);
    expect(logged[0].evalPassed).toBe(false);
  });
});

describe("runAgent — eval gate (AC4)", () => {
  it("blocks a usable result when the eval fails", async () => {
    const runEval = async () => ({ passed: false, score: 0.3, reason: "ungrounded claim" });
    const { deps, logged } = mk({ runEval });
    const r = await runAgent(deps, { ...base, evalRubric: { instructions: "grounding" } });
    expect(r.evalPassed).toBe(false);
    if (!r.evalPassed) expect(r.reason).toContain("ungrounded");
    expect("value" in r).toBe(false);
    expect(logged[0].evalPassed).toBe(false); // failure recorded
  });
});

describe("runAgent — tenant + tool scoping (AC5)", () => {
  it("refuses an out-of-workspace tool", async () => {
    const { deps } = mk();
    await expect(runAgent(deps, { ...base, tools: ["adminWipe"] })).rejects.toBeInstanceOf(CrossTenantToolError);
  });
  it("refuses a call with no workspace", async () => {
    const { deps } = mk();
    await expect(runAgent(deps, { ...base, tenantId: "" })).rejects.toThrow(/workspace/);
  });
});

describe("runAgent — idempotency", () => {
  it("returns the prior run without calling the model again", async () => {
    const callModel = vi.fn(async (): Promise<ModelCallResult> => ({ rawText: '{"ok":true}', inputTokens: 0, outputTokens: 0, toolsCalled: [] }));
    const prior: AgentRunRow = {
      tenantId: "t1", kind: "demo", requestId: "r1", input: "hello", toolsCalled: [],
      output: { ok: true }, inputTokens: 3, outputTokens: 2, latencyMs: 12, evalPassed: true, evalReason: null, evalScore: 0.9,
    };
    const { deps } = mk({ callModel, findRun: async () => prior });
    const r = await runAgent(deps, base);
    expect(callModel).not.toHaveBeenCalled();
    expect(r.evalPassed && r.value).toEqual({ ok: true });
  });
});
