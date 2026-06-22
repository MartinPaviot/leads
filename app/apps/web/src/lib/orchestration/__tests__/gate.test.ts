import { describe, it, expect } from "vitest";
import {
  resolveGate,
  runGate,
  InMemoryOrchestrationStore,
  type GateDecisionInput,
  type GateStep,
  type RunGateDeps,
} from "../gate";

describe("resolveGate (AC3, pure)", () => {
  const payload = { subject: "Hi", body: "original" };
  it("approve -> resume unchanged", () => {
    expect(resolveGate(payload, { type: "approve" })).toEqual({ action: "resume", payload });
  });
  it("edit -> resume with edited payload", () => {
    const edited = { subject: "Hi", body: "edited" };
    expect(resolveGate(payload, { type: "edit", editedPayload: edited })).toEqual({ action: "resume", payload: edited });
  });
  it("reject -> halt", () => {
    expect(resolveGate(payload, { type: "reject" })).toEqual({ action: "halt", payload });
  });
});

// A fake step that asserts the run is blocked at wait time, then applies the
// decision (or simulates a timeout when decision is null).
function fakeStep(store: InMemoryOrchestrationStore, runId: string, decision: GateDecisionInput | null): GateStep {
  return {
    waitForGate: async ({ gateId }) => {
      const run = await store.getRun(runId);
      expect(run?.state).toBe("blocked"); // blocked until decided (AC2)
      if (decision === null) return null; // timeout
      await store.decideGate(gateId, decision);
      return { gateId };
    },
  };
}

async function runWith(decision: GateDecisionInput | null, payload: unknown) {
  const store = new InMemoryOrchestrationStore();
  const runId = await store.createRun({ tenantId: "t1", kind: "demo" });
  const deps: RunGateDeps = { store, step: fakeStep(store, runId, decision) };
  const res = await runGate(deps, { tenantId: "t1", runId, kind: "review", payload });
  const run = await store.getRun(runId);
  return { res, state: run?.state };
}

describe("runGate — block + resolve (AC2/AC3/AC5)", () => {
  it("blocks until decided; approve resumes unchanged and run returns to running", async () => {
    const { res, state } = await runWith({ type: "approve" }, { x: 1 });
    expect(res).toEqual({ action: "resume", payload: { x: 1 } });
    expect(state).toBe("running");
  });
  it("edit resumes with the edited payload", async () => {
    const { res, state } = await runWith({ type: "edit", editedPayload: { x: 2 } }, { x: 1 });
    expect(res).toEqual({ action: "resume", payload: { x: 2 } });
    expect(state).toBe("running");
  });
  it("reject halts the run", async () => {
    const { res, state } = await runWith({ type: "reject" }, { x: 1 });
    expect(res.action).toBe("halt");
    expect(state).toBe("halted");
  });
  it("timeout halts the run (a gate never silently passes)", async () => {
    const { res, state } = await runWith(null, { x: 1 });
    expect(res.action).toBe("halt");
    expect(state).toBe("halted");
  });
});

describe("decideGate idempotency", () => {
  it("keeps the first decision when decided twice", async () => {
    const store = new InMemoryOrchestrationStore();
    const runId = await store.createRun({ tenantId: "t1", kind: "demo" });
    const gateId = await store.createGate({ tenantId: "t1", runId, kind: "review", payload: {} });
    const first = await store.decideGate(gateId, { type: "approve" });
    const second = await store.decideGate(gateId, { type: "reject" });
    expect(first.type).toBe("approve");
    expect(second.type).toBe("approve"); // first wins
  });
});

describe("fake two-step gated workflow", () => {
  async function twoStep(decision: GateDecisionInput | null, initial: Record<string, unknown>) {
    const store = new InMemoryOrchestrationStore();
    const runId = await store.createRun({ tenantId: "t1", kind: "two-step" });
    const deps: RunGateDeps = { store, step: fakeStep(store, runId, decision) };
    const ran: string[] = [];
    ran.push("step1");
    const afterStep1 = { ...initial, step1: true };
    const res = await runGate(deps, { tenantId: "t1", runId, kind: "review", payload: afterStep1 });
    if (res.action === "halt") return { ran, halted: true, finalPayload: null as unknown };
    ran.push("step2");
    return { ran, halted: false, finalPayload: res.payload };
  }

  it("reject halts before step2", async () => {
    const r = await twoStep({ type: "reject" }, { a: 1 });
    expect(r.ran).toEqual(["step1"]);
    expect(r.halted).toBe(true);
  });
  it("approve runs step2 with the unchanged payload", async () => {
    const r = await twoStep({ type: "approve" }, { a: 1 });
    expect(r.ran).toEqual(["step1", "step2"]);
    expect(r.finalPayload).toEqual({ a: 1, step1: true });
  });
  it("edit runs step2 with the edited payload", async () => {
    const r = await twoStep({ type: "edit", editedPayload: { a: 99, step1: true } }, { a: 1 });
    expect(r.ran).toEqual(["step1", "step2"]);
    expect(r.finalPayload).toEqual({ a: 99, step1: true });
  });
});
