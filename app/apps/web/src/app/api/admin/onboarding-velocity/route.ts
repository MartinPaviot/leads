/**
 * GET /api/admin/onboarding-velocity
 *
 * P0-3 follow-up — admin tile that surfaces time-to-complete
 * distribution + per-phase friction across all tenants. Reads from
 * `onboarding_progress` ; pure aggregation runs in the helper so
 * the same numbers are re-derivable by any cron / report.
 *
 * Tenant-scoped tile : when the caller isn't admin, we still
 * return a single-tenant snapshot (their own onboarding row) so
 * the founder gets a personal velocity view ; full cross-tenant
 * stats require admin role.
 */

import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { onboardingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  computeVelocityStats,
  computePhaseDropoff,
} from "@/lib/onboarding/velocity";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestAll = url.searchParams.get("scope") === "all";

  // Admin gating only when the caller asks for cross-tenant stats.
  if (requestAll) {
    const adminCheck = requireAdmin(authCtx);
    if (adminCheck) return adminCheck;
  }

  const rows = await db
    .select({
      tenantId: onboardingProgress.tenantId,
      startedAt: onboardingProgress.startedAt,
      completedAt: onboardingProgress.completedAt,
      currentPhase: onboardingProgress.currentPhase,
      completedPhases: onboardingProgress.completedPhases,
    })
    .from(onboardingProgress)
    .where(
      requestAll
        ? undefined
        : eq(onboardingProgress.tenantId, authCtx.tenantId),
    );

  const stats = computeVelocityStats(
    rows.map((r) => ({
      tenantId: r.tenantId,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      currentPhase: r.currentPhase,
      completedPhases: (r.completedPhases as number[] | null) ?? [],
    })),
  );
  const dropoff = computePhaseDropoff(stats);

  return NextResponse.json({
    scope: requestAll ? "all" : "tenant",
    asOf: new Date().toISOString(),
    stats,
    dropoff,
  });
}
