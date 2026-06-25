/**
 * Agent Observability — Trace, measure, and monitor every AI call.
 *
 * Wraps generateText/generateObject/streamText with automatic:
 * - Latency tracking (p50, p95, p99)
 * - Token usage + cost estimation
 * - Tool call recording
 * - Error capture
 * - Online eval sampling (10% of traces scored by LLM-as-judge)
 * - DB persistence to agent_traces table
 */

import { db } from "@/db";
import { agentTraces } from "@/db/schema";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import { trackTokenUsage } from "../billing/cost-tracker";
import logger from "./logger";

// ─── Agent Registry ──────────────────────────────────────────
// The canonical AGENT_REGISTRY is in ./agent-registry.ts (zero DB deps).
// Re-exported here for backward compatibility with web app imports.

import {
  AGENT_REGISTRY,
  type AgentCategory,
  type AgentDefinition,
} from "../agents/agent-registry";
export { AGENT_REGISTRY, type AgentCategory, type AgentDefinition };


// ─── Trace Context ───────────────────────────────────────────

export interface TraceContext {
  agentId: string;
  tenantId?: string;
  traceId?: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
}

interface TraceResult {
  traceId: string;
  spanId: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  toolCalls: Array<{ name: string; latencyMs?: number }>;
  status: "ok" | "error" | "timeout" | "corrected";
  errorMessage?: string;
}

// ─── Cost Estimation ─────────────────────────────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-sonnet": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "text-embedding-3-small": { input: 0.02 / 1_000_000, output: 0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(MODEL_COSTS).find((k) => model.includes(k)) || "claude-sonnet";
  const rates = MODEL_COSTS[key];
  return inputTokens * rates.input + outputTokens * rates.output;
}

// ─── Trace Recording ─────────────────────────────────────────

export async function recordTrace(
  ctx: TraceContext,
  result: {
    input?: string;
    output?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
    toolCalls?: Array<{ name: string; args?: unknown; latencyMs?: number }>;
    status: "ok" | "error" | "timeout" | "corrected";
    errorMessage?: string;
    correctionApplied?: string;
    evalScore?: number;
  },
): Promise<string> {
  const agent = AGENT_REGISTRY[ctx.agentId];
  const spanId = crypto.randomUUID();
  const traceId = ctx.traceId || crypto.randomUUID();

  const inputTokens = result.inputTokens || 0;
  const outputTokens = result.outputTokens || 0;
  const cost = result.model ? estimateCost(result.model, inputTokens, outputTokens) : 0;

  try {
    await db.insert(agentTraces).values({
      id: spanId,
      tenantId: ctx.tenantId || null,
      agentId: ctx.agentId,
      agentCategory: agent?.category || "api",
      traceId,
      parentSpanId: ctx.parentSpanId,
      input: result.input?.slice(0, 2000),
      output: result.output?.slice(0, 2000),
      model: result.model,
      status: result.status,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
      latencyMs: result.latencyMs,
      toolCalls: (result.toolCalls || []) as unknown as Record<string, unknown>[],
      toolCallsCount: result.toolCalls?.length || 0,
      errorMessage: result.errorMessage,
      correctionApplied: result.correctionApplied,
      evalScore: result.evalScore,
      metadata: ctx.metadata || {},
    });

    // Also track cost in the billing system
    if (ctx.tenantId && result.model && (inputTokens > 0 || outputTokens > 0)) {
      await trackTokenUsage({
        model: result.model,
        inputTokens,
        outputTokens,
        tenantId: ctx.tenantId,
        feature: ctx.agentId,
      }).catch((e) => console.warn("observability: trackTokenUsage failed (non-blocking)", e));
    }

    // Check alert thresholds
    if (agent) {
      if (result.latencyMs > agent.maxLatencyMs) {
        logger.warn(`[ALERT] Agent ${ctx.agentId} latency ${result.latencyMs}ms exceeds max ${agent.maxLatencyMs}ms`);
      }
      if (cost > agent.maxCostPerCall && agent.maxCostPerCall > 0) {
        logger.warn(`[ALERT] Agent ${ctx.agentId} cost $${cost.toFixed(4)} exceeds max $${agent.maxCostPerCall}`);
      }
      if (result.evalScore !== undefined && result.evalScore < agent.qualityThreshold) {
        logger.warn(`[ALERT] Agent ${ctx.agentId} eval score ${result.evalScore.toFixed(2)} below threshold ${agent.qualityThreshold}`);
      }
    }

    // ── Flywheel: emit trace event for async online eval sampling ──
    // Each sampled trace fans out to an LLM-as-judge call. EVAL_ONLINE_SAMPLING=0
    // disables that fan-out entirely (kill-switch); default (unset) keeps the
    // per-agent evalSampleRate behaviour.
    if (
      agent &&
      process.env.EVAL_ONLINE_SAMPLING !== "0" &&
      agent.evalSampleRate > 0 &&
      result.input &&
      result.output &&
      result.status === "ok"
    ) {
      if (Math.random() < agent.evalSampleRate) {
        try {
          const { inngest } = await import("@/inngest/client");
          await inngest.send({
            name: "eval/trace-created",
            data: {
              traceId: spanId,
              agentId: ctx.agentId,
              input: result.input.slice(0, 1000),
              output: result.output.slice(0, 2000),
            },
          });
        } catch {
          // Flywheel should never break the app
        }
      }
    }
  } catch (err) {
    // Observability should never break the app
    logger.error("Failed to record trace", { agentId: ctx.agentId, error: String(err) });
  }

  return spanId;
}

// ─── Wrapper: traceAgent() ───────────────────────────────────

/**
 * Wraps any async agent function with automatic tracing.
 * Use this around generateText, generateObject, or any agent logic.
 *
 * @example
 * const result = await traceAgent({ agentId: "draft-email", tenantId }, async (span) => {
 *   const r = await generateText({ model, prompt });
 *   span.setOutput(r.text);
 *   span.setTokens(r.usage.promptTokens, r.usage.completionTokens);
 *   span.setModel("claude-sonnet-4-6");
 *   return r;
 * });
 */
export async function traceAgent<T>(
  ctx: TraceContext,
  fn: (span: SpanRecorder) => Promise<T>,
): Promise<T> {
  const span = new SpanRecorder();
  const start = Date.now();

  try {
    const result = await fn(span);
    const latencyMs = Date.now() - start;

    await recordTrace(ctx, {
      input: span._input,
      output: span._output,
      model: span._model,
      inputTokens: span._inputTokens,
      outputTokens: span._outputTokens,
      latencyMs,
      toolCalls: span._toolCalls,
      status: span._correctionApplied ? "corrected" : "ok",
      correctionApplied: span._correctionApplied,
      evalScore: span._evalScore,
    });

    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isTimeout = String(err).includes("timeout") || String(err).includes("ETIMEDOUT");

    await recordTrace(ctx, {
      input: span._input,
      output: span._output,
      model: span._model,
      inputTokens: span._inputTokens,
      outputTokens: span._outputTokens,
      latencyMs,
      toolCalls: span._toolCalls,
      status: isTimeout ? "timeout" : "error",
      errorMessage: String(err).slice(0, 500),
    });

    throw err;
  }
}

export class SpanRecorder {
  _input?: string;
  _output?: string;
  _model?: string;
  _inputTokens = 0;
  _outputTokens = 0;
  _toolCalls: Array<{ name: string; args?: unknown; latencyMs?: number }> = [];
  _correctionApplied?: string;
  _evalScore?: number;

  setInput(input: string) { this._input = input; return this; }
  setOutput(output: string) { this._output = output; return this; }
  setModel(model: string) { this._model = model; return this; }
  setTokens(input: number, output: number) {
    this._inputTokens = input;
    this._outputTokens = output;
    return this;
  }
  addToolCall(name: string, args?: unknown, latencyMs?: number) {
    this._toolCalls.push({ name, args, latencyMs });
    return this;
  }
  setCorrectionApplied(description: string) {
    this._correctionApplied = description;
    return this;
  }
  setEvalScore(score: number) { this._evalScore = score; return this; }
}

// ─── Dashboard Queries ───────────────────────────────────────

export interface AgentHealth {
  agentId: string;
  agentName: string;
  category: AgentCategory;
  totalTraces: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgCost: number;
  totalCost: number;
  avgEvalScore: number | null;
  evalPassRate: number | null;
  correctionRate: number;
  qualityThreshold: number;
  status: "healthy" | "degraded" | "critical";
}

export async function getAgentHealth(
  tenantId: string | null,
  since: Date,
): Promise<AgentHealth[]> {
  const conditions = tenantId
    ? and(gte(agentTraces.createdAt, since), eq(agentTraces.tenantId, tenantId))
    : gte(agentTraces.createdAt, since);

  const traces = await db
    .select({
      agentId: agentTraces.agentId,
      agentCategory: agentTraces.agentCategory,
      status: agentTraces.status,
      latencyMs: agentTraces.latencyMs,
      estimatedCost: agentTraces.estimatedCost,
      evalScore: agentTraces.evalScore,
      correctionApplied: agentTraces.correctionApplied,
    })
    .from(agentTraces)
    .where(conditions);

  // Group by agentId
  const byAgent = new Map<string, typeof traces>();
  for (const t of traces) {
    const arr = byAgent.get(t.agentId) || [];
    arr.push(t);
    byAgent.set(t.agentId, arr);
  }

  const results: AgentHealth[] = [];

  for (const [agentId, agentTraceList] of byAgent) {
    const agent = AGENT_REGISTRY[agentId];
    const total = agentTraceList.length;
    const errors = agentTraceList.filter((t) => t.status === "error" || t.status === "timeout").length;
    const corrections = agentTraceList.filter((t) => t.correctionApplied).length;

    const latencies = agentTraceList
      .map((t) => t.latencyMs)
      .filter((l): l is number => l !== null)
      .sort((a: number, b: number) => a - b);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length : 0;
    const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const costs = agentTraceList.map((t: { estimatedCost?: number | null }) => t.estimatedCost || 0);
    const totalCost = costs.reduce((a: number, b: number) => a + b, 0);
    const avgCost = total > 0 ? totalCost / total : 0;

    const evalScores = agentTraceList
      .map((t: { evalScore?: number | null }) => t.evalScore)
      .filter((s: number | null | undefined): s is number => s !== null && s !== undefined);
    const avgEvalScore = evalScores.length > 0 ? evalScores.reduce((a: number, b: number) => a + b, 0) / evalScores.length : null;
    const evalPassRate = evalScores.length > 0
      ? evalScores.filter((s: number) => s >= (agent?.qualityThreshold || 0.7)).length / evalScores.length
      : null;

    const errorRate = total > 0 ? errors / total : 0;
    const correctionRate = total > 0 ? corrections / total : 0;
    const threshold = agent?.qualityThreshold || 0.7;

    // Determine health status
    let status: "healthy" | "degraded" | "critical" = "healthy";
    if (errorRate > 0.20 || (avgEvalScore !== null && avgEvalScore < threshold * 0.8)) {
      status = "critical";
    } else if (
      errorRate > 0.05 ||
      correctionRate > 0.30 ||
      (avgEvalScore !== null && avgEvalScore < threshold)
    ) {
      status = "degraded";
    }

    results.push({
      agentId,
      agentName: agent?.name || agentId,
      category: (agent?.category || agentTraceList[0]?.agentCategory || "api") as AgentCategory,
      totalTraces: total,
      errorRate,
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: Math.round(p95Latency),
      avgCost,
      totalCost,
      avgEvalScore,
      evalPassRate,
      correctionRate,
      qualityThreshold: threshold,
      status,
    });
  }

  return results.sort((a, b) => {
    const statusOrder = { critical: 0, degraded: 1, healthy: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

/**
 * Get recent traces for a specific agent (for debugging).
 */
export async function getAgentTraces(
  agentId: string,
  limit = 20,
  tenantId?: string,
) {
  const conditions = tenantId
    ? and(eq(agentTraces.agentId, agentId), eq(agentTraces.tenantId, tenantId))
    : eq(agentTraces.agentId, agentId);

  return db
    .select()
    .from(agentTraces)
    .where(conditions)
    .orderBy(desc(agentTraces.createdAt))
    .limit(limit);
}
