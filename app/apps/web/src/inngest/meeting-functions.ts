import { inngest } from "./client";
import { db } from "@/db";
import { activities, authAccounts, authUsers, users } from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { fetchMicrosoftMeetings } from "@/lib/calendar-microsoft";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/calendar";
import { tracedGenerateText } from "@/lib/traced-ai";
import { createBot } from "@/lib/recall";

/**
 * Background calendar sync — runs every 15 minutes.
 * Syncs both Google and Microsoft calendars for all connected users.
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

      for (const provider of providers) {
        try {
          let meetings: SyncedMeeting[] = [];

          if (provider === "google") {
            meetings = await fetchRecentMeetings(userId, 7, 14);
          } else if (provider === "microsoft-entra-id") {
            meetings = await fetchMicrosoftMeetings(userId, 7, 14);
          }

          // Import meetings that don't exist yet
          for (const meeting of meetings) {
            // Find tenant for user
            const [userRow] = await db
              .select({ tenantId: users.tenantId })
              .from(users)
              .where(eq(users.clerkId, userId))
              .limit(1);
            const tenantId = userRow?.tenantId;
            if (!tenantId) continue;

            const [existing] = await db
              .select({ id: activities.id })
              .from(activities)
              .where(
                and(
                  eq(activities.tenantId, tenantId),
                  sql`metadata->>'calendarEventId' = ${meeting.calendarEventId}`
                )
              )
              .limit(1);

            if (!existing) {

              const isPast = meeting.startTime < new Date();

              await db.insert(activities).values({
                tenantId,
                actorType: "user",
                actorId: userId,
                entityType: "contact",
                entityId: "unknown",
                activityType: isPast ? "meeting_completed" : "meeting_scheduled",
                channel: "meeting",
                direction: "outbound",
                occurredAt: meeting.startTime,
                summary: meeting.title,
                metadata: {
                  calendarEventId: meeting.calendarEventId,
                  calendarSource: provider === "google" ? "google" : "microsoft",
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
              });
              totalSynced++;

              // Auto-schedule Recall.ai bot for upcoming meetings with a meeting link
              if (
                process.env.RECALL_API_KEY &&
                meeting.meetingLink &&
                !isPast &&
                meeting.startTime.getTime() - Date.now() < 30 * 60 * 1000 // within 30 min
              ) {
                try {
                  const [created] = await db
                    .select({ id: activities.id })
                    .from(activities)
                    .where(
                      and(
                        eq(activities.tenantId, tenantId),
                        sql`metadata->>'calendarEventId' = ${meeting.calendarEventId}`
                      )
                    )
                    .limit(1);
                  if (created) {
                    const { createBotForActivity } = await import("@/lib/recording/bot-deployment");
                    await createBotForActivity(created.id);
                  }
                } catch (recallErr) {
                  console.warn(`[Recall] Failed to schedule bot for meeting ${meeting.calendarEventId}:`, recallErr);
                  // Never break calendar sync because of Recall.ai failure
                }
              }
            }
          }
        } catch (err) {
          console.error(`Calendar sync failed for user ${userId} (${provider}):`, err);
          errors++;
        }
      }
    }

    return { synced: totalSynced, users: userProviders.size, errors };
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
    const { contacts, companies, deals } = await import("@/db/schema");

    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (!model) return { error: "No LLM configured" };

    // Gather context from attendees
    const attendees = meta.attendees || [];
    let context = `Meeting: ${activity.summary}\nDate: ${meta.startTime}\n\nAttendees:\n`;

    for (const att of attendees) {
      context += `- ${att.displayName || att.email} (${att.email})\n`;

      // Look up in CRM
      if (att.email) {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, att.email)))
          .limit(1);

        if (contact) {
          context += `  Role: ${contact.title || "Unknown"}\n`;
          if (contact.companyId) {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, contact.companyId))
              .limit(1);
            if (company) {
              context += `  Company: ${company.name} (${company.industry || ""}, ${company.size || ""} employees)\n`;
            }
          }
        }
      }
    }

    // Get recent interactions
    const recentActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.entityId, activity.entityId),
          sql`${activities.id} != ${activityId}`
        )
      )
      .orderBy(sql`occurred_at DESC`)
      .limit(5);

    if (recentActivities.length > 0) {
      context += "\nRecent Interactions:\n";
      for (const a of recentActivities) {
        context += `- ${a.activityType} (${a.occurredAt?.toISOString().split("T")[0]}): ${a.summary?.slice(0, 100)}\n`;
      }
    }

    const { text: prepDoc } = await tracedGenerateText({
      model,
      prompt: `Generate a concise meeting prep document for an upcoming sales meeting.

${context}

Include:
1. Account snapshot (what we know about the company/contact)
2. Key attendees and their roles
3. Recent interaction summary
4. Suggested talking points
5. Questions to ask
6. Potential objections and responses

Keep it actionable and under 500 words.`,
      _trace: { agentId: "generate-meeting-prep", tenantId },
    });

    // Save prep to activity
    await db
      .update(activities)
      .set({
        metadata: { ...meta, prepDocument: prepDoc, prepGeneratedAt: new Date().toISOString() },
      })
      .where(eq(activities.id, activityId));

    return { success: true, activityId };
  }
);
