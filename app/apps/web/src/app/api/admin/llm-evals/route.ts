/**
 * GET /api/admin/llm-evals — admin-gated snapshot of `llm_calls`
 * and `eval_runs` for Sprint-1 dashboard.
 *
 * Returns three sections :
 *  1. Calls aggregate (last 7 days) — per-surface cost + latency p95
 *     + error rate + retry rate + fallback rate. Drives the cost /
 *     reliability picture.
 *  2. Eval runs (last 8 weeks) — per-suite pass-rate trend so prompt
 *     drift is visible at a glance.
 *  3. Recent terminal failures (last 50) — for incident triage.
 *
 * Admin gating mirrors `/api/admin/onboarding-metrics`.
 */

import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { llmCalls, evalRuns } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const evalSince = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);

  // ── Calls aggregate per surface ────────────────────────────
  // Approximate p95 latency via percentile_cont. Postgres-only.
  const callsBySurface = await db
    .select({
      surfaceId: llmCalls.surfaceId,
      promptId: llmCalls.promptId,
      total: sql<number>`count(*)::int`,
      okCount: sql<number>`count(*) FILTER (WHERE ${llmCalls.outcome} = 'ok')::int`,
      errorCount: sql<number>`count(*) FILTER (WHERE ${llmCalls.outcome} = 'error')::int`,
      timeoutCount: sql<number>`count(*) FILTER (WHERE ${llmCalls.outcome} = 'timeout')::int`,
      fallbackCount: sql<number>`count(*) FILTER (WHERE ${llmCalls.fallbackTriggered} = true)::int`,
      retriedCount: sql<number>`count(*) FILTER (WHERE ${llmCalls.attempts} > 1)::int`,
      totalCostUsd: sql<number>`COALESCE(sum(${llmCalls.costUsd}), 0)::float8`,
      avgLatencyMs: sql<number>`COALESCE(avg(${llmCalls.latencyMs}), 0)::int`,
      p95LatencyMs: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${llmCalls.latencyMs}), 0)::int`,
    })
    .from(llmCalls)
    .where(gte(llmCalls.createdAt, since))
    .groupBy(llmCalls.surfaceId, llmCalls.promptId)
    .orderBy(desc(sql`count(*)`));

  // ── Eval-run timeline per surface ─────────────────────────
  const recentEvalRuns = await db
    .select()
    .from(evalRuns)
    .where(gte(evalRuns.createdAt, evalSince))
    .orderBy(desc(evalRuns.createdAt))
    .limit(200);

  // ── Recent terminal failures (last 50, oldest-first) ──────
  const recentFailures = await db
    .select({
      id: llmCalls.id,
      surfaceId: llmCalls.surfaceId,
      promptId: llmCalls.promptId,
      model: llmCalls.model,
      outcome: llmCalls.outcome,
      attempts: llmCalls.attempts,
      fallbackTriggered: llmCalls.fallbackTriggered,
      latencyMs: llmCalls.latencyMs,
      errorMessage: llmCalls.errorMessage,
      createdAt: llmCalls.createdAt,
    })
    .from(llmCalls)
    .where(
      and(
        gte(llmCalls.createdAt, since),
        sql`${llmCalls.outcome} <> 'ok'`,
      ),
    )
    .orderBy(desc(llmCalls.createdAt))
    .limit(50);

  return NextResponse.json({
    windowDays: days,
    sinceCalls: since.toISOString(),
    sinceEvalRuns: evalSince.toISOString(),
    callsBySurface: callsBySurface.map((row) => ({
      surfaceId: row.surfaceId,
      promptId: row.promptId,
      total: Number(row.total ?? 0),
      okRate: row.total ? Number(row.okCount ?? 0) / Number(row.total) : 0,
      errorCount: Number(row.errorCount ?? 0),
      timeoutCount: Number(row.timeoutCount ?? 0),
      fallbackRate: row.total ? Number(row.fallbackCount ?? 0) / Number(row.total) : 0,
      retryRate: row.total ? Number(row.retriedCount ?? 0) / Number(row.total) : 0,
      totalCostUsd: Number(row.totalCostUsd ?? 0),
      avgLatencyMs: Number(row.avgLatencyMs ?? 0),
      p95LatencyMs: Number(row.p95LatencyMs ?? 0),
    })),
    evalRuns: recentEvalRuns.map((r) => ({
      // P0-evals follow-up : surface the run id so the dashboard
      // can deep-link into the per-case drill-down.
      id: r.id,
      surfaceId: r.surfaceId,
      promptId: r.promptId,
      createdAt: r.createdAt,
      casesTotal: r.casesTotal,
      casesPassed: r.casesPassed,
      casesErrored: r.casesErrored,
      passRate: r.casesTotal ? r.casesPassed / r.casesTotal : 0,
      metrics: r.metrics,
      totalLatencyMs: r.totalLatencyMs,
      totalCostUsd: r.totalCostUsd,
    })),
    recentFailures,
  });
}
