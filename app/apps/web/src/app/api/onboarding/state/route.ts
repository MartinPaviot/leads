/**
 * GET  /api/onboarding/state — current phase, completed, checklist.
 * MONACO-PARITY-03 — the spine the front-end polls to render the
 * 7-phase wizard with hard gates.
 */

import { db } from "@/db";
import { onboardingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { evaluateOnboardingChecklist } from "@/lib/onboarding/checklist";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Upsert-on-read: if the tenant has no row yet, create it at phase
  // 1. Avoids a separate "initialise onboarding" endpoint and means
  // the front-end always sees a usable shape.
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

  // Live checklist evaluation — never trust the persisted snapshot
  // alone; gates depend on DB state (TAM size, sequences, etc.).
  const checklist = await evaluateOnboardingChecklist(authCtx.tenantId);

  return Response.json({
    currentPhase: row.currentPhase,
    completedPhases: row.completedPhases ?? [],
    phaseData: row.phaseData ?? {},
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    checklist: {
      gates: checklist.gates,
      allHardPassed: checklist.allHardPassed,
      failingHard: checklist.failingHard.map((g) => g.key),
    },
    // P0-3 task 3.1 — surfaced for the client telemetry helper. Sent
    // here rather than via a separate /me endpoint because the wizard
    // already polls this on mount and on every phase submit.
    userId: authCtx.userId,
    tenantId: authCtx.tenantId,
  });
}
