import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sequenceSteps, sequences } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { logger } from "@/lib/observability/logger";

/**
 * PATCH /api/sequences/:id/steps/:stepId — edit a single sequence step.
 *
 * Accepts partial updates for `subjectTemplate`, `bodyTemplate`, and
 * `delayDays`. Tenant-scoped lookup prevents cross-tenant edits.
 *
 * Q2 unlock: editing is allowed on ACTIVE sequences. Queued outbound
 * emails for steps the user hasn't reached yet will pick up the new
 * template at send-time — the Inngest worker reads the step row
 * fresh. Already-sent emails are historical and untouched.
 *
 * DELETE /api/sequences/:id/steps/:stepId — remove a step. Renumbers
 * remaining steps so step_number stays dense. Also gated to tenant.
 */

type RouteCtx = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, stepId } = await params;

  try {
    // Verify the parent sequence belongs to this tenant.
    const [sequence] = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!sequence) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      subjectTemplate?: string;
      bodyTemplate?: string;
      delayDays?: number;
    };
    const updates: Record<string, unknown> = {};
    if (typeof body.subjectTemplate === "string") updates.subjectTemplate = body.subjectTemplate.trim();
    if (typeof body.bodyTemplate === "string") updates.bodyTemplate = body.bodyTemplate.trim();
    if (typeof body.delayDays === "number" && body.delayDays >= 0) updates.delayDays = body.delayDays;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(sequenceSteps)
      .set(updates)
      .where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.sequenceId, id)))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    return NextResponse.json({ step: updated });
  } catch (err) {
    logger.error("sequences: PATCH step failed", { err, sequenceId: id, stepId });
    return NextResponse.json({ error: "Failed to update step" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, stepId } = await params;

  try {
    const [sequence] = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!sequence) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    await db
      .delete(sequenceSteps)
      .where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.sequenceId, id)));

    // Re-number the remaining steps so step_number stays contiguous. The
    // Inngest scheduler uses step_number to find the next step-due, so
    // gaps would misroute a mid-sequence contact.
    const remaining = await db
      .select({ id: sequenceSteps.id, stepNumber: sequenceSteps.stepNumber })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber);
    for (let i = 0; i < remaining.length; i++) {
      const want = i + 1;
      if (remaining[i].stepNumber !== want) {
        await db
          .update(sequenceSteps)
          .set({ stepNumber: want })
          .where(eq(sequenceSteps.id, remaining[i].id));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("sequences: DELETE step failed", { err, sequenceId: id, stepId });
    return NextResponse.json({ error: "Failed to delete step" }, { status: 500 });
  }
}
