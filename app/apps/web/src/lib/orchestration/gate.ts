/**
 * Approval-gate primitive (spec 03, AC2/AC3/AC5). A run persists a gate, blocks
 * on the gate.decided event, then resolves: reject -> halt, edit -> resume with
 * the edited payload, approve -> resume unchanged. The decision resolution is a
 * pure function (unit-tested); persistence + the Inngest waitForEvent wiring are
 * thin (gated integration / real adapter).
 */

export type GateDecisionType = "approve" | "reject" | "edit";

export interface GateDecisionInput {
  type: GateDecisionType;
  /** Required when type === "edit". */
  editedPayload?: unknown;
  reason?: string;
  decidedBy?: string;
}

export type RunState = "running" | "blocked" | "halted" | "completed" | "failed";

export interface GateResolution {
  action: "resume" | "halt";
  payload: unknown;
}

/**
 * Pure (AC3): map a decision onto the next action.
 *   approve -> resume unchanged · edit -> resume with edited payload · reject -> halt.
 */
export function resolveGate(originalPayload: unknown, decision: GateDecisionInput): GateResolution {
  switch (decision.type) {
    case "approve":
      return { action: "resume", payload: originalPayload };
    case "edit":
      return { action: "resume", payload: decision.editedPayload ?? originalPayload };
    case "reject":
      return { action: "halt", payload: originalPayload };
    default: {
      const _exhaustive: never = decision.type;
      throw new Error(`unknown gate decision: ${String(_exhaustive)}`);
    }
  }
}

export interface CreateGateParams {
  tenantId: string;
  runId: string;
  kind: string;
  payload: unknown;
}

export interface GateRecord {
  id: string;
  runId: string;
  kind: string;
  payload: unknown;
  decision: GateDecisionInput | null;
}

export interface CreateRunParams {
  tenantId: string;
  kind: string;
  payload?: unknown;
  inngestEventId?: string;
}

/** Persistence boundary the orchestrator uses. In-memory (tests) + DB impls. */
export interface OrchestrationStore {
  createRun(p: CreateRunParams): Promise<string>;
  getRun(runId: string): Promise<{ state: RunState; currentModule: string | null } | null>;
  setRunState(runId: string, state: RunState): Promise<void>;
  setCurrentModule(runId: string, module: string): Promise<void>;
  createGate(p: CreateGateParams): Promise<string>;
  /** Idempotent on gateId — only the first decision sticks; returns the effective one. */
  decideGate(gateId: string, decision: GateDecisionInput): Promise<GateDecisionInput>;
  getGate(gateId: string): Promise<GateRecord | null>;
}

/** Minimal step shape so runGate is testable with a fake. The real Inngest
 *  adapter implements waitForEvent via step.waitForEvent on the gate.decided
 *  event with `if: event.data.gateId == <gateId>`. Resolves null on timeout. */
export interface GateStep {
  waitForGate(opts: { gateId: string; timeout: string }): Promise<{ gateId: string } | null>;
}

export interface RunGateDeps {
  store: OrchestrationStore;
  step: GateStep;
}

export interface RunGateParams {
  tenantId: string;
  runId: string;
  kind: string;
  payload: unknown;
  /** Inngest duration string; default 7d. */
  timeout?: string;
}

/**
 * Persist a gate, block the run until decided (or timeout), and resolve. Sets
 * run state blocked -> (running | halted). On timeout the run halts (a gate
 * never silently passes).
 */
export async function runGate(deps: RunGateDeps, params: RunGateParams): Promise<GateResolution> {
  const gateId = await deps.store.createGate({
    tenantId: params.tenantId,
    runId: params.runId,
    kind: params.kind,
    payload: params.payload,
  });
  await deps.store.setRunState(params.runId, "blocked");

  const event = await deps.step.waitForGate({ gateId, timeout: params.timeout ?? "7d" });
  if (!event) {
    await deps.store.setRunState(params.runId, "halted");
    return { action: "halt", payload: params.payload };
  }

  const gate = await deps.store.getGate(gateId);
  const decision = gate?.decision ?? { type: "reject" as const };
  const res = resolveGate(params.payload, decision);
  await deps.store.setRunState(params.runId, res.action === "halt" ? "halted" : "running");
  return res;
}

// ─── In-memory store (tests) ─────────────────────────────────────

let _seq = 0;
function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}_${_seq}`;
}

export class InMemoryOrchestrationStore implements OrchestrationStore {
  private runs = new Map<string, { state: RunState; currentModule: string | null }>();
  private gates = new Map<string, GateRecord>();

  async createRun(p: CreateRunParams): Promise<string> {
    const id = uid("run");
    this.runs.set(id, { state: "running", currentModule: null });
    void p;
    return id;
  }
  async getRun(runId: string) {
    return this.runs.get(runId) ?? null;
  }
  async setRunState(runId: string, state: RunState): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.state = state;
  }
  async setCurrentModule(runId: string, module: string): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.currentModule = module;
  }
  async createGate(p: CreateGateParams): Promise<string> {
    const id = uid("gate");
    this.gates.set(id, { id, runId: p.runId, kind: p.kind, payload: p.payload, decision: null });
    return id;
  }
  async decideGate(gateId: string, decision: GateDecisionInput): Promise<GateDecisionInput> {
    const g = this.gates.get(gateId);
    if (!g) throw new Error(`gate not found: ${gateId}`);
    if (g.decision) return g.decision; // idempotent — first decision wins
    g.decision = decision;
    return decision;
  }
  async getGate(gateId: string): Promise<GateRecord | null> {
    return this.gates.get(gateId) ?? null;
  }
}
