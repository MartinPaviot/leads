/**
 * Human-in-the-loop capture approval (gap E / Lightfield-parity).
 *
 * The Lightfield half of the mission calls for human approval of
 * auto-captured data. This is the single seam every auto-capture path
 * (email sync, meeting transcript, call post-process) calls instead of
 * inserting an `activities` row directly:
 *
 *   - tenant settings.captureApprovalMode = 'auto'  (default) → insert now
 *   - tenant settings.captureApprovalMode = 'review'          → park in
 *     capture_approvals for a human to approve, deduped by sourceRef
 *
 * Default is 'auto', so existing tenants are unaffected until they opt in.
 */

import { db } from "@/db";
import { activities, captureApprovals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type CaptureKind = "email" | "meeting" | "call";
export type CaptureApprovalMode = "auto" | "review";

type ActivityInsert = typeof activities.$inferInsert;

/** Resolve the tenant's capture mode from its settings blob (default auto). */
export function getCaptureApprovalMode(
  settings: Record<string, unknown> | null | undefined,
): CaptureApprovalMode {
  const m = String(settings?.captureApprovalMode ?? "").toLowerCase();
  return m === "review" ? "review" : "auto";
}

export interface RecordCaptureArgs {
  tenantId: string;
  mode: CaptureApprovalMode;
  kind: CaptureKind;
  /** Idempotency key (gmailMessageId / meetingId / callId). */
  sourceRef?: string | null;
  /** The exact activities row to create (now, or on approval). */
  activity: ActivityInsert;
  summary?: string | null;
}

export interface RecordCaptureResult {
  /** true → activity inserted now; false → queued for review. */
  applied: boolean;
  activityId?: string;
  approvalId?: string;
}

/**
 * Record a captured interaction. In 'auto' mode inserts the activity (the
 * pre-gap-E behaviour). In 'review' mode parks the proposed activity in
 * capture_approvals (idempotent on sourceRef) for human approval.
 */
export async function recordCapturedActivity(
  args: RecordCaptureArgs,
): Promise<RecordCaptureResult> {
  if (args.mode !== "review") {
    const [row] = await db
      .insert(activities)
      .values(args.activity)
      .returning({ id: activities.id });
    return { applied: true, activityId: row.id };
  }

  // Review mode — dedup on (tenant, kind, sourceRef) so re-sync doesn't
  // enqueue the same interaction twice.
  if (args.sourceRef) {
    const [existing] = await db
      .select({ id: captureApprovals.id })
      .from(captureApprovals)
      .where(
        and(
          eq(captureApprovals.tenantId, args.tenantId),
          eq(captureApprovals.kind, args.kind),
          eq(captureApprovals.sourceRef, args.sourceRef),
        ),
      )
      .limit(1);
    if (existing) return { applied: false, approvalId: existing.id };
  }

  const [row] = await db
    .insert(captureApprovals)
    .values({
      tenantId: args.tenantId,
      kind: args.kind,
      sourceRef: args.sourceRef ?? null,
      proposedActivity: args.activity as unknown as object,
      summary: args.summary ?? args.activity.summary ?? null,
      status: "pending",
    })
    .returning({ id: captureApprovals.id });
  return { applied: false, approvalId: row.id };
}

/** Pending approvals for a tenant, newest first. */
export async function listPendingApprovals(tenantId: string, limit = 100) {
  return db
    .select()
    .from(captureApprovals)
    .where(and(eq(captureApprovals.tenantId, tenantId), eq(captureApprovals.status, "pending")))
    .orderBy(desc(captureApprovals.createdAt))
    .limit(limit);
}

/** Approve a pending capture: insert the proposed activity, mark applied. */
export async function approveCapture(
  tenantId: string,
  id: string,
  userId: string,
): Promise<{ activityId: string } | null> {
  const [appr] = await db
    .select()
    .from(captureApprovals)
    .where(and(eq(captureApprovals.id, id), eq(captureApprovals.tenantId, tenantId)))
    .limit(1);
  if (!appr || appr.status !== "pending") return null;

  const [act] = await db
    .insert(activities)
    .values(appr.proposedActivity as ActivityInsert)
    .returning({ id: activities.id });

  await db
    .update(captureApprovals)
    .set({
      status: "approved",
      appliedActivityId: act.id,
      reviewedByUserId: userId,
      reviewedAt: new Date(),
    })
    .where(eq(captureApprovals.id, id));

  return { activityId: act.id };
}

/** Reject a pending capture (the interaction is discarded). */
export async function rejectCapture(
  tenantId: string,
  id: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .update(captureApprovals)
    .set({ status: "rejected", reviewedByUserId: userId, reviewedAt: new Date() })
    .where(
      and(
        eq(captureApprovals.id, id),
        eq(captureApprovals.tenantId, tenantId),
        eq(captureApprovals.status, "pending"),
      ),
    )
    .returning({ id: captureApprovals.id });
  return res.length > 0;
}
