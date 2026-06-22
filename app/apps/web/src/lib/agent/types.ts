/**
 * Agent service contract (spec 04). One governed entry — runAgent — with
 * injected dependencies so the deterministic parts (tool scoping, schema
 * repair-or-fail, metering, logging, the eval gate) are unit-tested with a
 * stubbed model. The model provider + tool source are injected, so the default
 * (Anthropic-direct + in-process tenant-scoped tools) can be swapped for
 * Bedrock/Composio later without touching this contract (RECONCILE.md decision A).
 */
import type { ZodType } from "zod";

export interface EvalRubric {
  /** What the judge checks (grounding / format / policy). */
  instructions: string;
  /** Pass threshold in [0,1]; default 0.7. */
  threshold?: number;
}

export interface EvalOutcome {
  passed: boolean;
  score: number;
  reason: string;
}

/** A failed eval / schema-repair is a returned NON-result, not an exception. */
export type AgentResult<T> =
  | { evalPassed: true; value: T; tokens: number; latencyMs: number; requestId: string }
  | { evalPassed: false; reason: string; tokens: number; latencyMs: number; requestId: string };

export interface ModelCallResult {
  /** Raw model output (JSON text expected when a schema is requested). */
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  /** Names of tools the model actually invoked. */
  toolsCalled: string[];
}

export interface RunAgentInput<T> {
  tenantId: string;
  kind: string;
  /** Caller-supplied idempotency key. */
  requestId: string;
  /** Prompt input (string or structured). */
  input: unknown;
  /** Output schema — the model output is validated against this (AC1). */
  schema: ZodType<T>;
  /** Workspace tool names to offer (resolved + scoped by resolveTools). */
  tools?: string[];
  /** The kind's eval rubric; when present, runs as a blocking gate (AC4). */
  evalRubric?: EvalRubric;
}

export interface MeterOpLike {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface AgentRunRow {
  tenantId: string;
  kind: string;
  requestId: string;
  input: unknown;
  toolsCalled: string[];
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  evalPassed: boolean | null;
  evalReason: string | null;
  evalScore: number | null;
}

/** Thrown when a requested tool is not in the workspace's scope (AC5). */
export class CrossTenantToolError extends Error {
  constructor(tool: string, tenantId: string) {
    super(`tool "${tool}" is not in workspace ${tenantId}'s scope`);
    this.name = "CrossTenantToolError";
  }
}

export interface RunAgentDeps {
  /** Call the model. Pure provider boundary (Anthropic-direct default; Bedrock swap). */
  callModel(args: {
    kind: string;
    prompt: unknown;
    tools: Record<string, unknown>;
    attempt: number;
    repairHint?: string;
  }): Promise<ModelCallResult>;
  /** Resolve the workspace-scoped toolset; MUST throw CrossTenantToolError for
   *  any requested tool outside the workspace scope (AC1-tools / AC5). */
  resolveTools(tenantId: string, requested: string[] | undefined): { tools: Record<string, unknown>; names: string[] };
  /** Run the kind's eval rubric on the output (AC4). */
  runEval(rubric: EvalRubric, input: unknown, output: unknown): Promise<EvalOutcome>;
  /** Meter the model call through the spec-02 middleware (AC2). */
  meter<R>(op: MeterOpLike, fn: () => Promise<R>): Promise<R>;
  /** Persist the agent_run row (AC3); idempotent on (tenant, requestId). */
  logRun(row: AgentRunRow): Promise<void>;
  /** Prior run for this requestId, or null (idempotency / retry-safety). */
  findRun(tenantId: string, requestId: string): Promise<AgentRunRow | null>;
}
