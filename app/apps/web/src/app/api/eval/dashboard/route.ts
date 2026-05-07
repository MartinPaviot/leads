import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { getAgentHealth, getAgentTraces, AGENT_REGISTRY, type AgentHealth } from "@/lib/observability/observability";

export const maxDuration = 30;

/**
 * GET /api/eval/dashboard
 *
 * Returns per-agent health metrics:
 * - Pass rate, avg latency, cost, error rate, quality trend
 * - Agent dependency graph
 * - Overall system health
 *
 * Query params:
 *   ?since=7d (default) | 24h | 30d
 *   ?agentId=chat (optional, filter to one agent)
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since") || "7d";
  const agentIdFilter = url.searchParams.get("agentId");

  // Parse "since" into a Date
  const sinceMs: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const since = new Date(Date.now() - (sinceMs[sinceParam] || sinceMs["7d"]));

  // If requesting a specific agent's traces
  if (agentIdFilter) {
    const traces = await getAgentTraces(agentIdFilter, 50, authCtx.tenantId);
    const health = await getAgentHealth(authCtx.tenantId, since);
    const agentHealth = health.find((h) => h.agentId === agentIdFilter);
    const agentDef = AGENT_REGISTRY[agentIdFilter];

    return Response.json({
      agent: agentDef || null,
      health: agentHealth || null,
      recentTraces: traces.map((t) => ({
        id: t.id,
        status: t.status,
        model: t.model,
        latencyMs: t.latencyMs,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        estimatedCost: t.estimatedCost,
        toolCallsCount: t.toolCallsCount,
        evalScore: t.evalScore,
        errorMessage: t.errorMessage,
        correctionApplied: t.correctionApplied,
        createdAt: t.createdAt,
      })),
    });
  }

  // Full dashboard: all agents
  const allHealth = await getAgentHealth(authCtx.tenantId, since);

  // Overall system metrics
  const totalTraces = allHealth.reduce((sum, h) => sum + h.totalTraces, 0);
  const totalCost = allHealth.reduce((sum, h) => sum + h.totalCost, 0);
  const criticalAgents = allHealth.filter((h) => h.status === "critical");
  const degradedAgents = allHealth.filter((h) => h.status === "degraded");
  const healthyAgents = allHealth.filter((h) => h.status === "healthy");

  const avgErrorRate = totalTraces > 0
    ? allHealth.reduce((sum, h) => sum + h.errorRate * h.totalTraces, 0) / totalTraces
    : 0;

  const evalScores = allHealth
    .filter((h) => h.avgEvalScore !== null)
    .map((h) => h.avgEvalScore!);
  const avgEvalScore = evalScores.length > 0
    ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length
    : null;

  // Agent dependency graph
  const dependencyGraph = buildDependencyGraph();

  return Response.json({
    period: sinceParam,
    since: since.toISOString(),

    system: {
      totalTraces,
      totalCost: Math.round(totalCost * 10000) / 10000,
      avgErrorRate: Math.round(avgErrorRate * 1000) / 1000,
      avgEvalScore: avgEvalScore !== null ? Math.round(avgEvalScore * 100) / 100 : null,
      healthBreakdown: {
        healthy: healthyAgents.length,
        degraded: degradedAgents.length,
        critical: criticalAgents.length,
      },
      overallStatus: criticalAgents.length > 0 ? "critical" : degradedAgents.length > 0 ? "degraded" : "healthy",
    },

    agents: allHealth.map((h) => ({
      ...h,
      avgLatencyMs: Math.round(h.avgLatencyMs),
      avgCost: Math.round(h.avgCost * 10000) / 10000,
      totalCost: Math.round(h.totalCost * 10000) / 10000,
      avgEvalScore: h.avgEvalScore !== null ? Math.round(h.avgEvalScore * 100) / 100 : null,
      evalPassRate: h.evalPassRate !== null ? Math.round(h.evalPassRate * 100) / 100 : null,
    })),

    registry: Object.values(AGENT_REGISTRY).map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      qualityThreshold: a.qualityThreshold,
      maxLatencyMs: a.maxLatencyMs,
      evalSampleRate: a.evalSampleRate,
    })),

    dependencyGraph,
  });
}

// ─── Agent Dependency Graph ──────────────────────────────────

function buildDependencyGraph() {
  return {
    nodes: Object.values(AGENT_REGISTRY).map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
    })),
    edges: [
      // OAuth triggers sync
      { from: "google-oauth-connected", to: "sync-emails", event: "email/sync-requested" },
      { from: "google-oauth-connected", to: "calendar-sync", event: "calendar/sync-requested" },

      // Cron triggers sync
      { from: "cron-email-sync", to: "sync-emails", event: "email/sync-requested" },

      // Sync creates entities
      { from: "sync-emails", to: "enrich-company", event: "company/created" },
      { from: "sync-emails", to: "enrich-contact", event: "contact/created" },

      // Enrichment triggers autofill
      { from: "enrich-company", to: "ai-autofill", event: "entity/auto-fill-requested" },
      { from: "enrich-contact", to: "ai-autofill", event: "entity/auto-fill-requested" },

      // Chat creates entities
      { from: "chat", to: "enrich-company", event: "company/created" },
      { from: "chat", to: "enrich-contact", event: "contact/created" },

      // Meeting prep chain
      { from: "auto-meeting-prep", to: "generate-meeting-prep", event: "meeting/generate-prep" },

      // Sequence chain
      { from: "send-sequence-step", to: "process-reply", event: "email/reply-received" },

      // Chat uses API agents
      { from: "chat", to: "draft-email", relation: "tool_call" },
      { from: "chat", to: "deal-analyze", relation: "tool_call" },
      { from: "chat", to: "meeting-prep", relation: "tool_call" },
      { from: "chat", to: "actions-recommender", relation: "tool_call" },

      // Workflow engine
      { from: "chat", to: "execute-workflow", event: "workflow/trigger" },
    ],
  };
}
