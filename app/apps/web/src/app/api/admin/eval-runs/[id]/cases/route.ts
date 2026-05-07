/**
 * GET /api/admin/eval-runs/[id]/cases
 *
 * Admin-only drill-down into the per-case detail of a single
 * `eval_runs` aggregate. Returns the cases ordered by status
 * (failed first, errored next, passed last) so on-call sees the
 * regressions at the top without scrolling.
 *
 * Query params :
 *   ?onlyFailing=1 — return only cases that didn't pass.
 *
 * Returns :
 *   {
 *     run: { id, surfaceId, promptId, casesTotal, casesPassed,
 *            casesErrored, metrics, totalLatencyMs, createdAt },
 *     cases: Array<{ caseId, passed, errored, latencyMs,
 *                    errorMessage, outputSnippet, createdAt }>
 *   }
 *
 * 404 when the run id doesn't exist (admin gating still hit before).
 */

import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { evalRuns, evalCaseRuns } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const onlyFailing = url.searchParams.get("onlyFailing") === "1";

  const [run] = await db
    .select({
      id: evalRuns.id,
      surfaceId: evalRuns.surfaceId,
      promptId: evalRuns.promptId,
      casesTotal: evalRuns.casesTotal,
      casesPassed: evalRuns.casesPassed,
      casesErrored: evalRuns.casesErrored,
      metrics: evalRuns.metrics,
      totalLatencyMs: evalRuns.totalLatencyMs,
      totalCostUsd: evalRuns.totalCostUsd,
      createdAt: evalRuns.createdAt,
    })
    .from(evalRuns)
    .where(eq(evalRuns.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Order : failed (passed=false, errored=false) first, errored
  // (errored=true) next, passed last. Within each bucket, longest
  // latency first — heaviest cases up top is what on-call wants.
  const conditions = [eq(evalCaseRuns.runId, id)];
  if (onlyFailing) {
    conditions.push(sql`${evalCaseRuns.passed} = false`);
  }

  const cases = await db
    .select({
      id: evalCaseRuns.id,
      caseId: evalCaseRuns.caseId,
      passed: evalCaseRuns.passed,
      errored: evalCaseRuns.errored,
      latencyMs: evalCaseRuns.latencyMs,
      errorMessage: evalCaseRuns.errorMessage,
      outputSnippet: evalCaseRuns.outputSnippet,
      createdAt: evalCaseRuns.createdAt,
    })
    .from(evalCaseRuns)
    .where(and(...conditions))
    .orderBy(
      // bucket 0 : failed (not passed and not errored).
      // bucket 1 : errored.
      // bucket 2 : passed.
      // Postgres-only CASE — works on prod + drizzle's pg adapter.
      sql`CASE
        WHEN NOT ${evalCaseRuns.passed} AND NOT ${evalCaseRuns.errored} THEN 0
        WHEN ${evalCaseRuns.errored} THEN 1
        ELSE 2
      END`,
      asc(evalCaseRuns.caseId),
    );

  return NextResponse.json({
    run: {
      id: run.id,
      surfaceId: run.surfaceId,
      promptId: run.promptId,
      casesTotal: run.casesTotal,
      casesPassed: run.casesPassed,
      casesErrored: run.casesErrored,
      casesFailed:
        run.casesTotal - run.casesPassed - run.casesErrored,
      metrics: run.metrics,
      totalLatencyMs: run.totalLatencyMs,
      totalCostUsd: run.totalCostUsd,
      createdAt: run.createdAt?.toISOString(),
    },
    cases: cases.map((c) => ({
      id: c.id,
      caseId: c.caseId,
      passed: c.passed,
      errored: c.errored,
      latencyMs: c.latencyMs,
      errorMessage: c.errorMessage,
      outputSnippet: c.outputSnippet,
      createdAt: c.createdAt?.toISOString(),
    })),
  });
}
