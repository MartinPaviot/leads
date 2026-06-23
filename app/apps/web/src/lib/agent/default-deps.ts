/**
 * Default agent-service dependencies (spec 04). Provides the deterministic,
 * infra-side deps: agent_run logging + idempotency lookup (Postgres), a
 * passthrough meter (spec-02 meter() is injected at the composition root once
 * it merges — keeps this off the unmerged feat/02), and a workspace tool
 * resolver that refuses out-of-scope tools (AC5). callModel + runEval stay
 * caller-injected because the model invocation + the kind's rubric live in the
 * calling feature-spec, not here (blast radius forbids feature prompts/rubrics).
 */
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  CrossTenantToolError,
  type AgentRunRow,
  type MeterOpLike,
  type RunAgentDeps,
} from "./types";

/** Persist the run; idempotent on (tenant, requestId). */
export async function dbLogRun(row: AgentRunRow): Promise<void> {
  await db
    .insert(agentRuns)
    .values({
      tenantId: row.tenantId,
      kind: row.kind,
      requestId: row.requestId,
      input: row.input as never,
      toolsCalled: row.toolsCalled as never,
      output: row.output as never,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      evalPassed: row.evalPassed,
      evalReason: row.evalReason,
      evalScore: row.evalScore,
    })
    .onConflictDoNothing({ target: [agentRuns.tenantId, agentRuns.requestId] });
}

export async function dbFindRun(tenantId: string, requestId: string): Promise<AgentRunRow | null> {
  const [r] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.requestId, requestId)))
    .limit(1);
  if (!r) return null;
  return {
    tenantId: r.tenantId,
    kind: r.kind,
    requestId: r.requestId,
    input: r.input,
    toolsCalled: (r.toolsCalled as string[]) ?? [],
    output: r.output,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    latencyMs: r.latencyMs ?? 0,
    evalPassed: r.evalPassed,
    evalReason: r.evalReason,
    evalScore: r.evalScore,
  };
}

/** No-op meter — runs fn. Replace with spec-02 meter() at the composition root. */
export async function passthroughMeter<R>(_op: MeterOpLike, fn: () => Promise<R>): Promise<R> {
  return fn();
}

/**
 * Build a resolveTools that only ever exposes a workspace's own tools and
 * throws CrossTenantToolError for any requested tool outside that scope (AC5).
 * `workspaceTools` maps tenantId -> { toolName -> tool }.
 */
export function makeWorkspaceToolResolver(
  workspaceTools: Record<string, Record<string, unknown>>,
): RunAgentDeps["resolveTools"] {
  return (tenantId, requested) => {
    const owned = workspaceTools[tenantId] ?? {};
    const names = requested ?? Object.keys(owned);
    const tools: Record<string, unknown> = {};
    for (const name of names) {
      if (!(name in owned)) throw new CrossTenantToolError(name, tenantId);
      tools[name] = owned[name];
    }
    return { tools, names };
  };
}

/** Assemble full deps from the caller-provided model + eval + tool scope. */
export function agentServiceDefaults(
  provided: Pick<RunAgentDeps, "callModel" | "runEval"> & {
    resolveTools?: RunAgentDeps["resolveTools"];
    meter?: RunAgentDeps["meter"];
  },
): RunAgentDeps {
  return {
    callModel: provided.callModel,
    runEval: provided.runEval,
    resolveTools: provided.resolveTools ?? (() => ({ tools: {}, names: [] })),
    meter: provided.meter ?? passthroughMeter,
    logRun: dbLogRun,
    findRun: dbFindRun,
  };
}
