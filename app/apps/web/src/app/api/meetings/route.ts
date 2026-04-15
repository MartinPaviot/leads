import { getAuthContext } from "@/lib/auth-utils";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/calendar";
import { db } from "@/db";
import { activities, authAccounts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
    const calendarMeetings = await fetchRecentMeetings(
      authCtx.userId,
      daysBack,
      daysForward
    );

    // M3 — detect which OAuth providers the user has linked so the UI
    // can explain where the meetings list is coming from. Microsoft
    // Calendar feed via Graph API is a TODO (tracked in
    // `_specs/REQUIREMENTS/10-meetings.md`); for now Microsoft users
    // see just the tracked activities instead of an error.
    const linkedAccounts = await db
      .select({ provider: authAccounts.provider })
      .from(authAccounts)
      .where(eq(authAccounts.userId, authCtx.userId));
    const hasGoogle = linkedAccounts.some((a) => a.provider === "google");
    const hasMicrosoft = linkedAccounts.some(
      (a) => a.provider === "microsoft-entra-id"
    );
    if (!hasGoogle && hasMicrosoft) {
      logger.info("meetings: microsoft-only user, MS Graph feed not implemented", {
        userId: authCtx.userId,
      });
    }

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
      calendarConnected: hasGoogle || hasMicrosoft,
      // M3 — so the UI can render a "Microsoft Calendar feed coming
      // soon" affordance for MS-only users instead of an empty state.
      provider: hasGoogle ? "google" : hasMicrosoft ? "microsoft" : null,
      microsoftFeedPending: !hasGoogle && hasMicrosoft,
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
 * Schedule a Recall.ai bot for a meeting via the branded-deployment wrapper.
 * Fire-and-forget.
 */
async function scheduleRecallBot(
  _meetingLink: string,
  activityId: string,
  _existingMeta: Record<string, unknown>
) {
  try {
    const { createBotForActivity } = await import("@/lib/recording/bot-deployment");
    const outcome = await createBotForActivity(activityId);
    if (outcome.status === "created") {
      console.log(`[Meetings] Recall bot ${outcome.bot.id} scheduled for activity ${activityId} (${outcome.decision.mode})`);
    } else {
      console.log(`[Meetings] Bot not scheduled for activity ${activityId}: ${outcome.reason}`);
    }
  } catch (err: any) {
    console.warn(`[Meetings] Failed to schedule Recall bot:`, err.message);
  }
}
