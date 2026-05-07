/**
 * POST /api/onboarding/complete — final transition.
 * MONACO-PARITY-03 — only succeeds when ALL hard checklist gates
 * pass. Sam Blond verbatim: "Onboarding is where Monaco wins or
 * loses." The complete step is the gate that decides whether the
 * tenant has a working sales engine or a half-configured shell. We
 * reject loudly when a hard gate fails — better to surface the gap
 * than to mark the tenant "done" and watch them churn at week 4.
 */

import { db } from "@/db";
import { onboardingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { evaluateOnboardingChecklist } from "@/lib/onboarding/checklist";
import { posthogEvents } from "@/lib/analytics/analytics";
import { logger } from "@/lib/observability/logger";

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checklist = await evaluateOnboardingChecklist(authCtx.tenantId);

  if (!checklist.allHardPassed) {
    posthogEvents
      .onboarding_v3_completed(authCtx.userId, {
        tenantId: authCtx.tenantId,
        success: false,
        failingGatesCount: checklist.failingHard.length,
      })
      .catch((err: unknown) =>
        logger.warn("complete: posthog emit failed", { err }),
      );
    return Response.json(
      {
        error: "Onboarding not ready",
        failingGates: checklist.failingHard.map((g) => ({
          key: g.key,
          reason: g.reason ?? "Required gate failed",
        })),
        allGates: checklist.gates,
      },
      { status: 409 },
    );
  }

  // Mark complete. Idempotent — re-calling on an already-complete
  // tenant returns ok with the same completedAt.
  let [row] = await db
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.tenantId, authCtx.tenantId))
    .limit(1);

  if (!row) {
    [row] = await db
      .insert(onboardingProgress)
      .values({
        tenantId: authCtx.tenantId,
        currentPhase: 7,
        completedPhases: [1, 2, 3, 4, 5, 6, 7],
        completedAt: new Date(),
      })
      .returning();
  } else if (!row.completedAt) {
    [row] = await db
      .update(onboardingProgress)
      .set({
        completedAt: new Date(),
        currentPhase: 7,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.tenantId, authCtx.tenantId))
      .returning();
  }

  // Successful completion telemetry — duration measured from
  // tenant's first onboarding_progress row insert.
  const startedMs = row.startedAt ? new Date(row.startedAt).getTime() : null;
  const completedMs = row.completedAt
    ? new Date(row.completedAt).getTime()
    : Date.now();
  const durationMs =
    startedMs && Number.isFinite(startedMs)
      ? Math.max(0, completedMs - startedMs)
      : undefined;
  posthogEvents
    .onboarding_v3_completed(authCtx.userId, {
      tenantId: authCtx.tenantId,
      success: true,
      durationMs,
    })
    .catch((err: unknown) =>
      logger.warn("complete: posthog emit failed", { err }),
    );

  return Response.json({
    ok: true,
    completedAt: row.completedAt,
    checklist: {
      gates: checklist.gates,
      allHardPassed: true,
    },
  });
}
