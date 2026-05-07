/**
 * POST /api/onboarding/phase/:n — submit phase N data, validate, advance.
 * MONACO-PARITY-03 — the hard-gate enforcer.
 *
 * Behaviour:
 *  - Body is parsed against `phaseSchemas[n]`. Invalid → 400.
 *  - On success, phase data is merged into `onboarding_progress.phase_data`,
 *    `current_phase` advances to n+1 (capped at 7), and n is added to
 *    `completed_phases`.
 *  - The user CANNOT submit phase n if they haven't completed n-1
 *    (prevents URL-tampering past gates).
 */

import { db } from "@/db";
import { onboardingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getPhaseSchema } from "@/lib/onboarding/phase-validators";
import { posthogEvents } from "@/lib/analytics/analytics";
import { logger } from "@/lib/observability/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ n: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { n } = await params;
  const phaseNum = Number(n);
  if (!Number.isInteger(phaseNum) || phaseNum < 1 || phaseNum > 7) {
    return Response.json({ error: "Invalid phase number" }, { status: 400 });
  }

  const schema = getPhaseSchema(phaseNum);
  if (!schema) {
    return Response.json({ error: "Unknown phase" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parse = schema.safeParse(payload);
  if (!parse.success) {
    posthogEvents
      .onboarding_v3_phase_submitted(authCtx.userId, {
        tenantId: authCtx.tenantId,
        phase: phaseNum,
        success: false,
        validationErrors: parse.error.issues.length,
      })
      .catch((err: unknown) =>
        logger.warn("phase: posthog emit failed", { err }),
      );
    return Response.json(
      {
        error: "Validation failed",
        issues: parse.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  // Load current progress (insert if missing).
  let [row] = await db
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.tenantId, authCtx.tenantId))
    .limit(1);
  if (!row) {
    [row] = await db
      .insert(onboardingProgress)
      .values({ tenantId: authCtx.tenantId })
      .returning();
  }

  // Hard sequencing — phase N requires phase N-1 to be in the
  // completed set (phase 1 has no prerequisite).
  const completed = new Set<number>(
    Array.isArray(row.completedPhases) ? (row.completedPhases as number[]) : [],
  );
  if (phaseNum > 1 && !completed.has(phaseNum - 1)) {
    return Response.json(
      {
        error: "Cannot skip phase",
        message: `Complete phase ${phaseNum - 1} before submitting phase ${phaseNum}`,
      },
      { status: 409 },
    );
  }

  // Merge phase data: keep prior phases, overwrite this phase.
  const priorData = (row.phaseData ?? {}) as Record<string, unknown>;
  const nextData = { ...priorData, [String(phaseNum)]: parse.data };

  completed.add(phaseNum);
  const sortedCompleted = Array.from(completed).sort((a, b) => a - b);
  const nextCurrent = Math.min(phaseNum + 1, 7);

  const [updated] = await db
    .update(onboardingProgress)
    .set({
      phaseData: nextData,
      completedPhases: sortedCompleted,
      currentPhase: Math.max(row.currentPhase, nextCurrent),
      updatedAt: new Date(),
    })
    .where(eq(onboardingProgress.tenantId, authCtx.tenantId))
    .returning();

  // Emit success event with duration since tenant's onboarding row
  // was created — lets PostHog cohorts reason about how long each
  // phase actually takes per founder.
  const startedMs = row.startedAt ? new Date(row.startedAt).getTime() : null;
  const durationSinceStartMs =
    startedMs && Number.isFinite(startedMs)
      ? Math.max(0, Date.now() - startedMs)
      : undefined;
  posthogEvents
    .onboarding_v3_phase_submitted(authCtx.userId, {
      tenantId: authCtx.tenantId,
      phase: phaseNum,
      success: true,
      durationSinceStartMs,
    })
    .catch((err: unknown) =>
      logger.warn("phase: posthog emit failed", { err }),
    );

  return Response.json({
    ok: true,
    phase: phaseNum,
    nextPhase: updated.currentPhase,
    completedPhases: updated.completedPhases,
  });
}
