/**
 * POST /api/sequences/drafts/[id]/approve
 *
 * P0-1 task 1.2 — approve transition.
 *
 * Body : { scheduledSendAt?: ISO8601 } (default: immediate)
 * Response : { draft, queuedAt }
 *
 * Optimistic locking : the request must include the current `version`
 * stamp in the body OR the route refuses (409) when two parallel
 * approvers race. The state-machine helper enforces the from→to
 * transition.
 *
 * On success : status flips to `approved`, `scheduledSendAt` set,
 * `version` incremented. The send worker picks it up on next tick.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequenceDrafts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { canTransition } from "@/lib/sequence-drafts/state-machine";
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

  let body: { scheduledSendAt?: string; version?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — defaults apply.
  }

  // Parse optional scheduled send time.
  let scheduledSendAt = new Date();
  if (body.scheduledSendAt) {
    const parsed = new Date(body.scheduledSendAt);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json(
        { error: "Invalid scheduledSendAt" },
        { status: 400 },
      );
    }
    scheduledSendAt = parsed;
  }

  // Load draft (tenant-scoped).
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

  // State-machine check.
  const transition = canTransition(draft.status as never, "approve");
  if (!transition.allowed) {
    return Response.json({ error: transition.reason }, { status: 409 });
  }

  // Optimistic lock — when caller supplies version, enforce it.
  if (typeof body.version === "number" && body.version !== draft.version) {
    return Response.json(
      {
        error: "Version mismatch — draft was updated by another reviewer",
        currentVersion: draft.version,
      },
      { status: 409 },
    );
  }

  // Atomic update : the WHERE clause re-asserts version so a parallel
  // approver who passed the in-memory check can still race-fail at
  // the SQL level.
  const updated = await db
    .update(sequenceDrafts)
    .set({
      status: "approved",
      scheduledSendAt,
      reviewedAt: new Date(),
      reviewedBy: authCtx.userId,
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
      {
        error: "Concurrent update detected — refresh and retry",
        currentVersion: draft.version,
      },
      { status: 409 },
    );
  }

  // Hand off to send worker. Fire-and-forget : a failure here doesn't
  // un-approve the draft ; the worker poll on next tick will pick it
  // up from the `approved` status.
  inngest
    .send({
      name: "email.send.queued",
      data: { draftId: id, tenantId: authCtx.tenantId },
    })
    .catch((err) =>
      logger.warn("approve-draft: inngest emit failed (non-blocking)", {
        draftId: id,
        err: err instanceof Error ? err.message : String(err),
      }),
    );

  return Response.json({
    draft: updated[0],
    queuedAt: new Date().toISOString(),
  });
}
