/**
 * POST /api/meetings/:id/attendance
 *
 * The rep marks a past meeting as held or no-show (or clears it). A no-show
 * leaves no trace anywhere else, so this human verdict is what makes the show
 * rate real — stored on the meeting activity's metadata (no migration), the
 * source of truth that `resolveAttendance` reads first. Tenant-scoped; only a
 * meeting activity can be marked.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { isMeetingAttendance } from "@/lib/meetings/attendance";
import { z } from "zod";

const bodySchema = z.object({
  // null clears the mark (back to inferred/unknown).
  attendance: z.enum(["held", "no_show"]).nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [activity] = await db
    .select({
      id: activities.id,
      entityType: activities.entityType,
      activityType: activities.activityType,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)),
    )
    .limit(1);

  if (!activity) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  const isMeeting =
    activity.entityType === "meeting" || String(activity.activityType).startsWith("meeting_");
  if (!isMeeting) {
    return Response.json({ error: "Not a meeting" }, { status: 400 });
  }

  try {
    const currentMeta = (activity.metadata ?? {}) as Record<string, unknown>;
    const next = parsed.data.attendance;
    const nextMeta: Record<string, unknown> = { ...currentMeta };
    if (next === null) {
      delete nextMeta.attendance;
      delete nextMeta.attendanceMarkedBy;
      delete nextMeta.attendanceMarkedAt;
    } else if (isMeetingAttendance(next)) {
      nextMeta.attendance = next;
      nextMeta.attendanceMarkedBy = authCtx.userId;
      nextMeta.attendanceMarkedAt = new Date().toISOString();
    }

    await db
      .update(activities)
      .set({ metadata: nextMeta })
      .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)));

    return Response.json({ ok: true, attendance: next });
  } catch (err) {
    logger.error("meetings: attendance POST failed", {
      err,
      meetingId: id,
      tenantId: authCtx.tenantId,
    });
    return Response.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
}
