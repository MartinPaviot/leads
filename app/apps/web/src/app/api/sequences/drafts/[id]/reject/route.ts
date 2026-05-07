/**
 * POST /api/sequences/drafts/[id]/reject
 *
 * P0-1 task 1.2 — reject transition.
 *
 * Body : { reason: string (3-200 chars), pauseEnrollment?: boolean (default: true) }
 * Response : { draft, enrollmentPaused }
 *
 * On reject :
 *  1. Status flips `pending_approval → rejected` (terminal).
 *  2. Reason is persisted, fed to the evaluator-optimizer learner
 *     (task 1.6) which derives a preventive rule for future drafts.
 *  3. By default the enrollment is paused — the founder rejected
 *     this STEP, but probably wants the SEQUENCE paused for review.
 *     Caller can override with `pauseEnrollment: false`.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequenceDrafts, sequenceEnrollments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  canTransition,
  validateRejectionReason,
} from "@/lib/sequence-drafts/state-machine";
import { inngest } from "@/inngest/client";
import { logger } from "@/lib/observability/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { reason?: unknown; pauseEnrollment?: boolean; version?: number } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Body must be JSON with `reason`" },
      { status: 400 },
    );
  }

  const reasonValidation = validateRejectionReason(body.reason);
  if (!reasonValidation.ok) {
    return Response.json({ error: reasonValidation.error }, { status: 400 });
  }
  const reason = reasonValidation.reason;
  const pauseEnrollment = body.pauseEnrollment !== false;

  const [draft] = await db
    .select()
    .from(sequenceDrafts)
    .where(
      and(
        eq(sequenceDrafts.id, id),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
      ),
    )
    .limit(1);

  if (!draft) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }

  const transition = canTransition(draft.status as never, "reject");
  if (!transition.allowed) {
    return Response.json({ error: transition.reason }, { status: 409 });
  }

  if (typeof body.version === "number" && body.version !== draft.version) {
    return Response.json(
      {
        error: "Version mismatch",
        currentVersion: draft.version,
      },
      { status: 409 },
    );
  }

  const updated = await db
    .update(sequenceDrafts)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: authCtx.userId,
      reviewReason: reason,
      version: draft.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceDrafts.id, id),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
        eq(sequenceDrafts.version, draft.version),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return Response.json(
      { error: "Concurrent update detected", currentVersion: draft.version },
      { status: 409 },
    );
  }

  // Pause the enrollment (default behaviour). Best-effort — failure
  // here doesn't un-reject the draft.
  let enrollmentPaused = false;
  if (pauseEnrollment) {
    try {
      const updateResult = await db
        .update(sequenceEnrollments)
        .set({ status: "paused" })
        .where(
          and(
            eq(sequenceEnrollments.id, draft.enrollmentId),
            eq(sequenceEnrollments.tenantId, authCtx.tenantId),
          ),
        );
      enrollmentPaused = (updateResult as { rowCount?: number }).rowCount !== 0;
    } catch (err) {
      logger.warn("reject-draft: enrollment pause failed (non-blocking)", {
        draftId: id,
        enrollmentId: draft.enrollmentId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Send the rejection to the evaluator-optimizer learner (task 1.6).
  // Fire-and-forget : the learner is best-effort signal extraction,
  // never blocks the API.
  inngest
    .send({
      name: "draft.rejected",
      data: {
        draftId: id,
        tenantId: authCtx.tenantId,
        reason,
        sequenceId: draft.sequenceId,
        stepId: draft.stepId,
      },
    })
    .catch((err) =>
      logger.warn("reject-draft: learner emit failed (non-blocking)", {
        draftId: id,
        err: err instanceof Error ? err.message : String(err),
      }),
    );

  return Response.json({
    draft: updated[0],
    enrollmentPaused,
  });
}
