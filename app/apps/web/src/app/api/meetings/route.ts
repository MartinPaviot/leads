import { getAuthContext } from "@/lib/auth-utils";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/calendar";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/meetings
 *
 * Single source of truth for meetings:
 * 1. Reads Google Calendar directly (real-time, no sync dependency)
 * 2. Ensures each calendar event has a matching activity row (creates if missing)
 * 3. Schedules Recall.ai bots for upcoming meetings with video links
 * 4. Returns meetings enriched with AI notes/transcripts from activities
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysBack = Number(url.searchParams.get("daysBack")) || 30;
  const daysForward = Number(url.searchParams.get("daysForward")) || 14;

  try {
    const calendarMeetings = await fetchRecentMeetings(authCtx.userId, daysBack, daysForward);

    // Load existing activities indexed by calendar event ID
    const meetingActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          sql`${activities.activityType} IN ('meeting_scheduled', 'meeting_completed')`
        )
      )
      .limit(500);

    const activityByEventId = new Map<string, (typeof meetingActivities)[number]>();
    for (const act of meetingActivities) {
      const meta = act.metadata as any;
      if (meta?.calendarEventId) {
        activityByEventId.set(meta.calendarEventId, act);
      }
    }

    const now = new Date();
    const in15min = new Date(now.getTime() + 15 * 60 * 1000);

    // Process each calendar meeting: ensure activity exists + schedule bot if needed
    const enriched = [];
    for (const m of calendarMeetings) {
      let activity = activityByEventId.get(m.calendarEventId);
      const isPast = m.startTime < now;

      // Create activity if missing
      if (!activity) {
        try {
          const [created] = await db
            .insert(activities)
            .values({
              tenantId: authCtx.tenantId,
              actorType: "system",
              actorId: null,
              entityType: "meeting",
              entityId: m.calendarEventId,
              activityType: isPast ? "meeting_completed" : "meeting_scheduled",
              channel: "meeting",
              direction: "internal",
              summary: m.title,
              occurredAt: m.startTime,
              metadata: {
                calendarEventId: m.calendarEventId,
                startTime: m.startTime.toISOString(),
                endTime: m.endTime.toISOString(),
                attendees: m.attendees.map((a) => ({
                  email: a.email,
                  name: a.displayName,
                })),
                location: m.location,
                meetingLink: m.meetingLink,
              },
            })
            .returning();
          activity = created;
        } catch {
          // Duplicate or constraint — ignore
        }
      }

      const meta = (activity?.metadata || {}) as any;

      // Schedule Recall bot for upcoming meetings with a video link (within 15 min)
      if (
        !isPast &&
        m.meetingLink &&
        m.startTime <= in15min &&
        !meta.recallBotId &&
        process.env.RECALL_API_KEY &&
        activity
      ) {
        scheduleRecallBot(m.meetingLink, activity.id, meta).catch((e) =>
          console.warn("meetings: scheduleRecallBot failed (non-blocking)", e),
        );
      }

      enriched.push({
        id: activity?.id || m.calendarEventId,
        calendarEventId: m.calendarEventId,
        title: m.title,
        description: m.description,
        startTime: m.startTime.toISOString(),
        endTime: m.endTime.toISOString(),
        attendees: m.attendees,
        location: m.location,
        meetingLink: m.meetingLink,
        status: m.status,
        isPast,
        hasTranscript: !!meta.hasTranscript,
        hasNotes: !!meta.structuredNotes,
        notes: meta.structuredNotes || null,
        recordingUrl: meta.recordingUrl || null,
        recallStatus: meta.recordingStatus || null,
        activityId: activity?.id || null,
      });
    }

    return Response.json({
      meetings: enriched,
      upcoming: enriched.filter((m) => !m.isPast).length,
      past: enriched.filter((m) => m.isPast).length,
      calendarConnected: true,
    });
  } catch (err: any) {
    if (err.message?.includes("not connected")) {
      return Response.json({
        meetings: [],
        upcoming: 0,
        past: 0,
        calendarConnected: false,
      });
    }
    console.error("Meetings fetch failed:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Schedule a Recall.ai bot for a meeting. Fire-and-forget.
 */
async function scheduleRecallBot(
  meetingLink: string,
  activityId: string,
  existingMeta: Record<string, unknown>
) {
  try {
    const { createBot } = await import("@/lib/recall");
    const bot = await createBot(meetingLink);

    await db
      .update(activities)
      .set({
        metadata: {
          ...existingMeta,
          recallBotId: bot.id,
          recordingStatus: "scheduled",
        },
      })
      .where(eq(activities.id, activityId));

    console.log(`[Meetings] Recall bot ${bot.id} scheduled for activity ${activityId}`);
  } catch (err: any) {
    console.warn(`[Meetings] Failed to schedule Recall bot:`, err.message);
  }
}
