import { getAuthContext } from "@/lib/auth/auth-utils";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/integrations/calendar";
import { fetchMicrosoftMeetings } from "@/lib/integrations/calendar-microsoft";
import { fetchCalDavMeetingsForTenant } from "@/lib/integrations/caldav-sync";
import { db } from "@/db";
import { activities, authAccounts, companies, contacts, connectedMailboxes } from "@/db/schema";
import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";

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
    // M3 — detect which OAuth providers the user has linked so we can
    // call the right calendar feed(s). We always fan out to every
    // connected provider in parallel and merge the results — users with
    // both Google and Microsoft connected (rare but legit on combined
    // workspaces) get the union, deduplicated by event id.
    const linkedAccounts = await db
      .select({ provider: authAccounts.provider })
      .from(authAccounts)
      .where(eq(authAccounts.userId, authCtx.userId));
    const hasGoogle = linkedAccounts.some((a) => a.provider === "google");
    const hasMicrosoft = linkedAccounts.some(
      (a) => a.provider === "microsoft-entra-id"
    );

    // CalDAV (custom IMAP/SMTP mailboxes — e.g. Zimbra) is tenant-scoped, not
    // tied to the user's OAuth accounts. Detect whether any mailbox has a
    // calendar collection wired so we know to fan out to it + to count the
    // calendar as connected.
    const caldavMailbox = await db
      .select({ id: connectedMailboxes.id })
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, authCtx.tenantId),
          eq(connectedMailboxes.provider, "smtp_custom"),
          isNotNull(connectedMailboxes.caldavUrl),
        ),
      )
      .limit(1);
    const hasCalDav = caldavMailbox.length > 0;

    // Fan out across every connected source in parallel. `allSettled` so a
    // transient outage on one (rate limit, expired token, brief 5xx) doesn't
    // blank the whole list — the user still sees the others.
    const [googleResult, microsoftResult, caldavResult] = await Promise.allSettled([
      hasGoogle
        ? fetchRecentMeetings(authCtx.userId, daysBack, daysForward)
        : Promise.resolve([] as SyncedMeeting[]),
      hasMicrosoft
        ? fetchMicrosoftMeetings(authCtx.userId, daysBack, daysForward)
        : Promise.resolve([] as SyncedMeeting[]),
      hasCalDav
        ? fetchCalDavMeetingsForTenant(authCtx.tenantId, daysBack, daysForward)
        : Promise.resolve([] as SyncedMeeting[]),
    ]);

    const googleMeetings =
      googleResult.status === "fulfilled" ? googleResult.value : [];
    const microsoftMeetings =
      microsoftResult.status === "fulfilled" ? microsoftResult.value : [];
    const caldavMeetings =
      caldavResult.status === "fulfilled" ? caldavResult.value : [];
    if (googleResult.status === "rejected") {
      logger.warn("meetings: google calendar fetch failed", {
        userId: authCtx.userId,
        err: googleResult.reason,
      });
    }
    if (microsoftResult.status === "rejected") {
      logger.warn("meetings: microsoft calendar fetch failed", {
        userId: authCtx.userId,
        err: microsoftResult.reason,
      });
    }
    if (caldavResult.status === "rejected") {
      logger.warn("meetings: caldav calendar fetch failed", {
        tenantId: authCtx.tenantId,
        err: caldavResult.reason,
      });
    }

    // Dedupe by `calendarEventId`. Cross-provider collisions are
    // theoretically possible (a user invited to the same event from
    // both calendars) but the ids encode the provider's namespace so
    // a true clash is vanishingly rare. If it ever happens we keep the
    // first-seen — Google wins by convention since it's the older
    // integration and the historical activity rows reference its ids.
    const seen = new Set<string>();
    const calendarMeetings: SyncedMeeting[] = [];
    for (const m of [...googleMeetings, ...microsoftMeetings, ...caldavMeetings]) {
      if (seen.has(m.calendarEventId)) continue;
      seen.add(m.calendarEventId);
      calendarMeetings.push(m);
    }
    calendarMeetings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Load existing activities indexed by calendar event ID
    const meetingActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          sql`${activities.activityType} IN ('meeting_scheduled', 'meeting_completed')`,
          isNull(activities.deletedAt),
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
        isAllDay: m.isAllDay,
        organizer: m.organizer || null,
        isRecurring: !!m.recurrence && m.recurrence.length > 0,
        hasTranscript: !!meta.hasTranscript,
        hasNotes: !!meta.structuredNotes,
        notes: meta.structuredNotes || null,
        recordingUrl: meta.recordingUrl || null,
        recallStatus: meta.recordingStatus || null,
        activityId: activity?.id || null,
        // Filled by the CRM-matching pass below — the account this meeting is
        // with and which attendees are known contacts.
        account: null as { id: string; name: string; domain: string | null } | null,
        matchedContacts: [] as Array<{ id: string; name: string; email: string | null; title: string | null }>,
      });
    }

    // ── Link each meeting to the CRM. Matching external attendees to contacts
    // (and through them to an account) is what makes this a sales surface and
    // not just a calendar: every meeting points at the company + the people we
    // already track, so the rep can jump straight to the pipeline.
    const attendeeEmails = [
      ...new Set(
        enriched
          .flatMap((m) => m.attendees.map((a) => a.email?.toLowerCase()))
          .filter((e): e is string => !!e),
      ),
    ];
    if (attendeeEmails.length > 0) {
      const contactRows = await db
        .select({
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          title: contacts.title,
          companyId: contacts.companyId,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, authCtx.tenantId),
            isNull(contacts.deletedAt),
            sql`lower(${contacts.email}) = ANY(${attendeeEmails})`,
          ),
        );
      const contactByEmail = new Map(
        contactRows.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]),
      );
      const companyIds = [
        ...new Set(contactRows.map((c) => c.companyId).filter((x): x is string => !!x)),
      ];
      const companyById = new Map<string, { id: string; name: string; domain: string | null }>();
      if (companyIds.length > 0) {
        const comps = await db
          .select({ id: companies.id, name: companies.name, domain: companies.domain })
          .from(companies)
          .where(and(eq(companies.tenantId, authCtx.tenantId), sql`${companies.id} = ANY(${companyIds})`));
        for (const c of comps) companyById.set(c.id, c);
      }
      for (const m of enriched) {
        const matched = m.attendees
          .map((a) => contactByEmail.get(a.email?.toLowerCase() ?? ""))
          .filter((c): c is NonNullable<typeof c> => !!c);
        m.matchedContacts = matched.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
          email: c.email,
          title: c.title,
        }));
        const primaryCompanyId = matched.find((c) => c.companyId)?.companyId;
        m.account = primaryCompanyId ? companyById.get(primaryCompanyId) ?? null : null;
      }
    }

    // Compute next meeting countdown and conflict detection
    const upcomingMeetings = enriched.filter((m) => !m.isPast && !m.isAllDay);
    const nextMeeting = upcomingMeetings.length > 0 ? upcomingMeetings[0] : null;

    // Detect scheduling conflicts: overlapping non-all-day meetings
    const conflicts: Array<{ meetingA: string; meetingB: string; overlapMinutes: number }> = [];
    for (let i = 0; i < upcomingMeetings.length; i++) {
      for (let j = i + 1; j < upcomingMeetings.length; j++) {
        const a = upcomingMeetings[i];
        const b = upcomingMeetings[j];
        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        // Check overlap
        if (aStart < bEnd && bStart < aEnd) {
          const overlapStart = Math.max(aStart, bStart);
          const overlapEnd = Math.min(aEnd, bEnd);
          const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);
          if (overlapMinutes > 0) {
            conflicts.push({
              meetingA: a.title,
              meetingB: b.title,
              overlapMinutes,
            });
          }
        }
      }
    }

    return Response.json({
      meetings: enriched,
      upcoming: upcomingMeetings.length,
      past: enriched.filter((m) => m.isPast).length,
      calendarConnected: hasGoogle || hasMicrosoft || hasCalDav,
      // M3 — so the UI can render a "Microsoft Calendar feed coming
      // soon" affordance for MS-only users instead of an empty state.
      provider: hasGoogle ? "google" : hasMicrosoft ? "microsoft" : hasCalDav ? "caldav" : null,
      microsoftFeedPending: !hasGoogle && hasMicrosoft,
      nextMeeting: nextMeeting ? {
        id: nextMeeting.id,
        title: nextMeeting.title,
        startTime: nextMeeting.startTime,
        endTime: nextMeeting.endTime,
        attendeeCount: nextMeeting.attendees.length,
        meetingLink: nextMeeting.meetingLink,
        minutesUntil: Math.max(0, Math.round((new Date(nextMeeting.startTime).getTime() - now.getTime()) / 60000)),
      } : null,
      conflicts,
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
