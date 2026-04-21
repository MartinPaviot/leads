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
import { trackTokenUsage } from "./cost-tracker";
import logger from "./logger";

// ─── Agent Registry ──────────────────────────────────────────

export type AgentCategory =
  | "conversational"
  | "background"
  | "api"
  | "classification"
  | "extraction"
  | "generation"
  | "rag";

export interface AgentDefinition {
  id: string;
  name: string;
  category: AgentCategory;
  description: string;
  expectedTools?: string[];
  qualityThreshold: number; // minimum acceptable eval score (0.0-1.0)
  maxLatencyMs: number; // alert if p95 exceeds this
  maxCostPerCall: number; // alert if single call exceeds this ($)
  evalSampleRate: number; // 0.0-1.0, fraction of traces to eval online
}

export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // ── Conversational ────────────────────────
  chat: {
    id: "chat",
    name: "Elevay Chat Agent",
    category: "conversational",
    description: "Main GTM copilot — CRM queries, deal coaching, email drafts, task management",
    expectedTools: ["searchCRM", "queryContacts", "queryAccounts", "queryDeals", "queryActivities", "queryNotes"],
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.50,
    evalSampleRate: 0.20,
  },

  // ── Background (Inngest) ──────────────────
  "enrich-company": {
    id: "enrich-company",
    name: "Enrich Company",
    category: "background",
    description: "Enriches company data via Apollo API after creation",
    qualityThreshold: 0.8,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.01,
    evalSampleRate: 0.05,
  },
  "enrich-contact": {
    id: "enrich-contact",
    name: "Enrich Contact",
    category: "background",
    description: "Enriches contact data via Apollo API after creation",
    qualityThreshold: 0.8,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.01,
    evalSampleRate: 0.05,
  },
  "send-sequence-step": {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    category: "generation",
    description: "Personalizes and sends templated sequence emails",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "process-reply": {
    id: "process-reply",
    name: "Process Reply",
    category: "classification",
    description: "Classifies incoming email replies (positive, negative, ooo, unsubscribe)",
    qualityThreshold: 0.85,
    maxLatencyMs: 5000,
    maxCostPerCall: 0.02,
    evalSampleRate: 0.20,
  },
  "ai-autofill": {
    id: "ai-autofill",
    name: "AI Auto-Fill Fields",
    category: "extraction",
    description: "Auto-fills custom fields from conversation history",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.15,
  },
  "calendar-sync": {
    id: "calendar-sync",
    name: "Calendar Sync",
    category: "background",
    description: "Syncs Google/Microsoft calendars every 15 minutes",
    qualityThreshold: 0.9,
    maxLatencyMs: 30000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "auto-meeting-prep": {
    id: "auto-meeting-prep",
    name: "Auto Meeting Prep",
    category: "background",
    description: "Triggers meeting prep generation for upcoming meetings",
    qualityThreshold: 0.8,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "generate-meeting-prep": {
    id: "generate-meeting-prep",
    name: "Generate Meeting Prep",
    category: "generation",
    description: "Generates comprehensive meeting briefing documents",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.15,
  },
  "sync-emails": {
    id: "sync-emails",
    name: "Sync Emails",
    category: "background",
    description: "Syncs Gmail/Outlook emails, auto-creates contacts",
    qualityThreshold: 0.9,
    maxLatencyMs: 60000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "cron-email-sync": {
    id: "cron-email-sync",
    name: "Cron Email Sync",
    category: "background",
    description: "Periodic email sync trigger",
    qualityThreshold: 0.9,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "google-oauth-connected": {
    id: "google-oauth-connected",
    name: "Google OAuth Connected",
    category: "background",
    description: "Triggers initial sync after Google OAuth connection",
    qualityThreshold: 0.9,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "execute-workflow": {
    id: "execute-workflow",
    name: "Execute Workflow",
    category: "background",
    description: "User-defined workflow orchestrator (notifications, tasks, webhooks)",
    qualityThreshold: 0.8,
    maxLatencyMs: 15000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },

  // ── API Endpoints ─────────────────────────
  "draft-email": {
    id: "draft-email",
    name: "Draft Email",
    category: "generation",
    description: "Drafts cold outreach emails with personalization",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "follow-up-email": {
    id: "follow-up-email",
    name: "Follow-up Email",
    category: "generation",
    description: "Generates follow-up emails based on meeting notes",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "suggest-reply": {
    id: "suggest-reply",
    name: "Reply Suggestion",
    category: "generation",
    description: "Generates 3 reply options with different tones",
    qualityThreshold: 0.7,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.10,
  },
  "meeting-prep": {
    id: "meeting-prep",
    name: "Meeting Prep API",
    category: "generation",
    description: "Generates meeting briefing documents via API",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.10,
  },
  "process-transcript": {
    id: "process-transcript",
    name: "Process Transcript",
    category: "extraction",
    description: "Extracts structured notes from meeting transcripts",
    qualityThreshold: 0.75,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.20,
    evalSampleRate: 0.20,
  },
  "account-summarize": {
    id: "account-summarize",
    name: "Account Summarization",
    category: "generation",
    description: "Auto-generates account summary and about business fields",
    qualityThreshold: 0.7,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.10,
  },
  "deal-analyze": {
    id: "deal-analyze",
    name: "Deal Analysis",
    category: "extraction",
    description: "Analyzes deals and recommends stage progression",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "deal-extract-intel": {
    id: "deal-extract-intel",
    name: "Deal Intelligence Extraction",
    category: "extraction",
    description: "Extracts structured deal intelligence from meeting notes",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "icp-analysis": {
    id: "icp-analysis",
    name: "ICP Analysis",
    category: "extraction",
    description: "Analyzes company website to infer ideal customer profile",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.20,
  },
  "build-tam": {
    id: "build-tam",
    name: "Build TAM Strategies",
    category: "extraction",
    description: "Generates 2-4 Apollo organization-search strategies from the tenant's business context + ICP",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "onboarding-narrator": {
    id: "onboarding-narrator",
    name: "Onboarding Narrator",
    category: "generation",
    description: "Streams the four-paragraph first-person read-back shown on the product step during onboarding",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "generate-sequence": {
    id: "generate-sequence",
    name: "Generate Outreach Sequence",
    category: "generation",
    description: "Generates 5-step cold outreach sequences with methodology framework",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.20,
  },
  "detect-signals": {
    id: "detect-signals",
    name: "Detect Buying Signals",
    category: "extraction",
    description: "Interprets Apollo enrichment data into actionable buying signals",
    qualityThreshold: 0.75,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.15,
  },
  "smart-import": {
    id: "smart-import",
    name: "Smart CSV Import",
    category: "classification",
    description: "AI-powered CSV import with automatic column mapping",
    qualityThreshold: 0.85,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.20,
  },
  "world-model": {
    id: "world-model",
    name: "World Model Generator",
    category: "extraction",
    description: "Builds business knowledge model from accumulated interactions",
    qualityThreshold: 0.7,
    maxLatencyMs: 60000,
    maxCostPerCall: 0.30,
    evalSampleRate: 0.10,
  },
  "actions-recommender": {
    id: "actions-recommender",
    name: "Actions Recommender",
    category: "generation",
    description: "Generates 5 priority actions to close more revenue",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
};

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
    if (agent && agent.evalSampleRate > 0 && result.input && result.output && result.status === "ok") {
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
      .sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const costs = agentTraceList.map((t) => t.estimatedCost || 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const avgCost = total > 0 ? totalCost / total : 0;

    const evalScores = agentTraceList
      .map((t) => t.evalScore)
      .filter((s): s is number => s !== null);
    const avgEvalScore = evalScores.length > 0 ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length : null;
    const evalPassRate = evalScores.length > 0
      ? evalScores.filter((s) => s >= (agent?.qualityThreshold || 0.7)).length / evalScores.length
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
