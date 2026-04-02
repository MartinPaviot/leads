import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { activities, tasks } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId))
    )
    .limit(1);

  if (!activity) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  const meta = (activity.metadata || {}) as any;

  // Fetch linked tasks if any
  let linkedTasks: any[] = [];
  if (meta.generatedTaskIds?.length) {
    linkedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, authCtx.tenantId),
          inArray(tasks.id, meta.generatedTaskIds)
        )
      );
  }

  return Response.json({
    meeting: {
      id: activity.id,
      title: activity.summary,
      date: meta.startTime || activity.occurredAt,
      endTime: meta.endTime,
      attendees: meta.attendees || [],
      location: meta.location,
      meetingLink: meta.meetingLink,
      calendarSource: meta.calendarSource || "google",
    },
    hasTranscript: !!meta.hasTranscript || !!meta.structuredNotes,
    transcriptSource: meta.transcriptSource,
    notes: meta.structuredNotes || null,
    followUpDraft: meta.followUpEmailDraft || null,
    tasks: linkedTasks,
    matchedContacts: meta.matchedContacts || [],
  });
}
