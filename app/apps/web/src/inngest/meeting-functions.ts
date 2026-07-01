import { inngest } from "./client";
import { db } from "@/db";
import { activities, authAccounts, authUsers, users, tenants } from "@/db/schema";
import { eq, and, sql, gte, lte, isNull, desc } from "drizzle-orm";
import { fetchMicrosoftMeetings } from "@/lib/integrations/calendar-microsoft";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/integrations/calendar";
import { fetchCalDavMeetingsForTenant, tenantsWithCalDav } from "@/lib/integrations/caldav-sync";
import { isNeedsReauth, markNeedsReauth, isOAuthAuthError } from "@/lib/integrations/sync-health";
import { tracedGenerateText } from "@/lib/ai/traced-ai";
import { createBot } from "@/lib/integrations/recall";

/**
 * Import one synced meeting as an `activities` row, idempotent by
 * calendarEventId. Shared by the OAuth (Google/Microsoft) and CalDAV sweeps so
 * every calendar source gets identical treatment: insert, a real-time signal
 * for completed meetings, and a Recall.ai bot for imminent ones with a link.
 * Returns whether a new row was inserted (for the synced counter).
 */
async function importCronMeeting(opts: {
  tenantId: string;
  actorId: string;
  meeting: SyncedMeeting;
  calendarSource: "google" | "microsoft" | "caldav";
}): Promise<boolean> {
  const { tenantId, actorId, meeting, calendarSource } = opts;

  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        sql`metadata->>'calendarEventId' = ${meeting.calendarEventId}`,
      ),
    )
    .limit(1);
  if (existing) return false;

  const isPast = meeting.startTime < new Date();

  const [insertedMeeting] = await db
    .insert(activities)
    .values({
      tenantId,
      actorType: "user",
      actorId,
      entityType: "contact",
      entityId: "unknown",
      activityType: isPast ? "meeting_completed" : "meeting_scheduled",
      channel: "meeting",
      direction: "outbound",
      occurredAt: meeting.startTime,
      summary: meeting.title,
      metadata: {
        calendarEventId: meeting.calendarEventId,
        calendarSource,
        startTime: meeting.startTime.toISOString(),
        endTime: meeting.endTime.toISOString(),
        attendees: meeting.attendees.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
        })),
        location: meeting.location,
        meetingLink: meeting.meetingLink,
        status: meeting.status,
      },
    })
    .returning();

  if (isPast && insertedMeeting) {
    await inngest
      .send({
        name: "signals/evaluate-realtime",
        data: { type: "meeting_completed" as const, tenantId, activityId: insertedMeeting.id },
      })
      .catch((e) => console.warn("meeting-sync: realtime-signal trigger failed (non-blocking)", e));
  }

  if (
    process.env.RECALL_API_KEY &&
    meeting.meetingLink &&
    !isPast &&
    insertedMeeting &&
    meeting.startTime.getTime() - Date.now() < 30 * 60 * 1000
  ) {
    try {
      const { createBotForActivity } = await import("@/lib/recording/bot-deployment");
      await createBotForActivity(insertedMeeting.id);
    } catch (recallErr) {
      console.warn(`[Recall] Failed to schedule bot for meeting ${meeting.calendarEventId}:`, recallErr);
    }
  }

  return true;
}

/**
 * Background calendar sync — runs every 15 minutes.
 * Syncs Google, Microsoft (OAuth) and CalDAV (custom IMAP/SMTP) calendars.
 */
export const cronCalendarSync = inngest.createFunction(
  {
    id: "cron-calendar-sync",
    name: "Background Calendar Sync (Google + Microsoft)",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    // Find all users with OAuth accounts
    const accounts = await step.run("find-oauth-users", async () => {
      const rows = await db
        .select({
          userId: authAccounts.userId,
          provider: authAccounts.provider,
        })
        .from(authAccounts)
        .where(
          sql`${authAccounts.provider} IN ('google', 'microsoft-entra-id') AND ${authAccounts.access_token} IS NOT NULL`
        );
      return rows;
    });

    // Group by user — a user might have both Google and Microsoft
    const userProviders = new Map<string, string[]>();
    for (const row of accounts) {
      const list = userProviders.get(row.userId) || [];
      list.push(row.provider);
      userProviders.set(row.userId, list);
    }

    let totalSynced = 0;
    let errors = 0;

    for (const [userId, providers] of userProviders.entries()) {
      // Get user's tenant
      const [user] = await db
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1);
      if (!user) continue;

      // Resolve tenant + its sync-health once per user (for the needs_reauth skip).
      const [appUser] = await db
        .select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.clerkId, userId))
        .limit(1);
      const userTenantId = appUser?.tenantId ?? null;
      let tenantSettings: unknown = null;
      if (userTenantId) {
        const [t] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, userTenantId))
          .limit(1);
        tenantSettings = t?.settings ?? null;
      }

      for (const provider of providers) {
        // Skip dead connections — don't hammer a token that needs re-auth.
        if (userTenantId && isNeedsReauth(tenantSettings, userId, provider)) continue;
        try {
          let meetings: SyncedMeeting[] = [];

          if (provider === "google") {
            meetings = await fetchRecentMeetings(userId, 7, 14);
          } else if (provider === "microsoft-entra-id") {
            meetings = await fetchMicrosoftMeetings(userId, 7, 14);
          }

          // Import meetings that don't exist yet. The tenant is the same for
          // every meeting in this user's batch, so resolve it once.
          const [userRow] = await db
            .select({ tenantId: users.tenantId })
            .from(users)
            .where(eq(users.clerkId, userId))
            .limit(1);
          const tenantId = userRow?.tenantId;
          if (!tenantId) continue;

          for (const meeting of meetings) {
            const inserted = await importCronMeeting({
              tenantId,
              actorId: userId,
              meeting,
              calendarSource: provider === "google" ? "google" : "microsoft",
            });
            if (inserted) totalSynced++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Calendar sync failed for user ${userId} (${provider}):`, msg);
          // Dead OAuth grant → flag needs_reauth so this cron + the email cron skip it.
          if (userTenantId && isOAuthAuthError(msg)) {
            await markNeedsReauth(userTenantId, userId, provider, msg);
          }
          errors++;
        }
      }
    }

    // ── CalDAV sweep — custom IMAP/SMTP mailboxes have no OAuth calendar, so
    // they're keyed by tenant (connected_mailboxes), not by auth account. ──
    const caldavTenants = await step.run("find-caldav-tenants", () => tenantsWithCalDav());
    for (const tenantId of caldavTenants) {
      try {
        const meetings = await fetchCalDavMeetingsForTenant(tenantId, 7, 14);
        for (const meeting of meetings) {
          const inserted = await importCronMeeting({
            tenantId,
            actorId: "caldav-sync",
            meeting,
            calendarSource: "caldav",
          });
          if (inserted) totalSynced++;
        }
      } catch (err) {
        console.error(
          `CalDAV sync failed for tenant ${tenantId}:`,
          err instanceof Error ? err.message : String(err),
        );
        errors++;
      }
    }

    return {
      synced: totalSynced,
      users: userProviders.size,
      caldavTenants: caldavTenants.length,
      errors,
    };
  }
);

/**
 * Auto-generate meeting prep for upcoming meetings (next 24h).
 * Runs every hour.
 */
export const autoMeetingPrep = inngest.createFunction(
  {
    id: "auto-meeting-prep",
    name: "Auto Meeting Prep Generation",
    retries: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find upcoming meetings in next 24h that have external attendees and no prep yet
    const upcoming = await step.run("find-upcoming-meetings", async () => {
      return db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.activityType, "meeting_scheduled"),
            eq(activities.channel, "meeting"),
            gte(activities.occurredAt, now),
            lte(activities.occurredAt, in24h),
            sql`metadata->>'prepDocument' IS NULL`
          )
        )
        .limit(20);
    });

    let prepped = 0;

    for (const meeting of upcoming) {
      const meta = (meeting.metadata || {}) as any;
      const attendees = meta.attendees || [];

      // Skip if no external attendees (all internal or empty)
      if (attendees.length === 0) continue;

      try {
        // Emit event for each meeting that needs prep
        await inngest.send({
          name: "meeting/generate-prep",
          data: {
            activityId: meeting.id,
            tenantId: meeting.tenantId,
          },
        });
        prepped++;
      } catch (err) {
        console.error(`Failed to trigger prep for meeting ${meeting.id}:`, err);
      }
    }

    return { checked: upcoming.length, prepTriggered: prepped };
  }
);

/**
 * Generate meeting prep for a single meeting.
 */
export const generateMeetingPrep = inngest.createFunction(
  {
    id: "generate-meeting-prep",
    name: "Generate Meeting Prep Document",
    retries: 2,
    triggers: [{ event: "meeting/generate-prep" }],
  },
  async ({ event, step }) => {
    const { activityId, tenantId } = event.data as { activityId: string; tenantId: string };

    const [activity] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
      .limit(1);

    if (!activity) return { error: "Activity not found" };

    const meta = (activity.metadata || {}) as any;
    if (meta.prepDocument) return { skipped: true, reason: "prep already exists" };

    // Call the existing prep API logic — we import it inline to avoid circular deps
    const { anthropic } = await import("@ai-sdk/anthropic");
    const { openai } = await import("@ai-sdk/openai");
    const { contacts } = await import("@/db/schema");

    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (!model) return { error: "No LLM configured" };

    // Phase 3b: gather context via the Company Brain instead of
    // composing per-attendee contact + company + recent-activities
    // queries inline. The brain returns the full account view —
    // contacts (with champion + intent), open deals (with risk +
    // stall + citation properties), recent activities, past
    // meetings (+ transcript chunk counts), knowledge entries,
    // graph facts, and chat memories — all freshness-tagged.
    const { composeMeetingPrepContext } = await import(
      "@/lib/company-brain/meeting-prep-context"
    );

    const attendees = (meta.attendees || []) as Array<{
      email?: string;
      displayName?: string;
    }>;
    const attendeeEmails = attendees
      .map((a) => a.email)
      .filter((e): e is string => !!e);

    // Resolve company ids :
    //   1. activity.entityId when entityType === 'company'
    //   2. companyIds of any contact whose email is in attendees
    const companyIds = new Set<string>();
    if (activity.entityType === "company" && activity.entityId) {
      companyIds.add(activity.entityId);
    }

    if (attendeeEmails.length > 0) {
      const matchedContacts = await db
        .select({ companyId: contacts.companyId })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            sql`${contacts.email} = ANY(${attendeeEmails})`,
          ),
        );
      for (const row of matchedContacts) {
        if (row.companyId) companyIds.add(row.companyId);
      }
    }

    const context = await composeMeetingPrepContext({
      meetingTitle: activity.summary,
      startTimeIso: meta.startTime ?? null,
      attendees,
      companyIds: Array.from(companyIds),
      tenantId,
    });

    // Specialize the prep to the MOMENT of the deal (computed, not configured):
    // a discovery brief differs from a demo, proposal, or close brief. Keep the
    // rich Company Brain context above and add the moment's Method doctrine.
    const { deals } = await import("@/db/schema");
    const { deriveMoment } = await import("@/lib/motion/moment");
    const { getStepDoctrine } = await import("@/lib/motion/doctrine");
    const { buildDoctrineBlock, buildMeetingPrepPrompt } = await import(
      "@/lib/meetings/meeting-prep-prompt"
    );

    // Best available deal for this meeting: a directly linked deal, else the
    // most recently touched open deal at any attendee's company.
    let dealStage: string | null = null;
    let dealOverride: string | null = null;
    if (activity.entityType === "deal" && activity.entityId) {
      const [d] = await db
        .select({ stage: deals.stage, properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, activity.entityId), eq(deals.tenantId, tenantId)))
        .limit(1);
      if (d) {
        dealStage = d.stage;
        const p = (d.properties ?? {}) as Record<string, unknown>;
        if (typeof p.momentOverride === "string") dealOverride = p.momentOverride;
      }
    } else if (companyIds.size > 0) {
      const [d] = await db
        .select({ stage: deals.stage, properties: deals.properties })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, tenantId),
            sql`${deals.companyId} = ANY(${Array.from(companyIds)})`,
            isNull(deals.deletedAt),
            sql`${deals.stage} NOT IN ('won','lost')`,
          ),
        )
        .orderBy(desc(deals.updatedAt))
        .limit(1);
      if (d) {
        dealStage = d.stage;
        const p = (d.properties ?? {}) as Record<string, unknown>;
        if (typeof p.momentOverride === "string") dealOverride = p.momentOverride;
      }
    }

    // No deal stage → fall back to the calendar/booking meetingType signal.
    const meetingTypeMoment: Record<string, "discovery" | "demo"> = {
      intro: "discovery",
      qualification: "discovery",
      follow_up: "discovery",
      deep_dive: "demo",
    };
    const moment = dealStage
      ? deriveMoment({ override: dealOverride, hasDeal: true, dealStage }).moment
      : (meetingTypeMoment[(meta.meetingType as string) ?? ""] ?? "discovery");

    const { rubric } = getStepDoctrine(moment);
    const doctrineBlock = buildDoctrineBlock(moment, rubric);

    const { text: prepDoc } = await tracedGenerateText({
      model,
      prompt: buildMeetingPrepPrompt(moment, context, doctrineBlock),
      _trace: { agentId: "generate-meeting-prep", tenantId },
    });

    // Save prep to activity
    await db
      .update(activities)
      .set({
        metadata: { ...meta, prepDocument: prepDoc, prepMoment: moment, prepGeneratedAt: new Date().toISOString() },
      })
      .where(eq(activities.id, activityId));

    return { success: true, activityId };
  }
);
