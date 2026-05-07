/**
 * FINDING-008: 24-hour auto-briefing trigger.
 *
 * Runs every hour. Finds meetings happening in the next 24-25 hours
 * that don't already have a briefing generated, and triggers briefing
 * generation for each one. This complements the existing `autoMeetingPrep`
 * function by also generating deal briefings for any deals associated
 * with the meeting attendees.
 *
 * The 24-25h window (instead of 0-24h) ensures each meeting is caught
 * exactly once across consecutive hourly runs without overlap gaps.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { activities, contacts, deals } from "@/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { sendNotification } from "@/lib/emails/notifications";

export const autoBriefingTrigger = inngest.createFunction(
  {
    id: "auto-briefing-trigger-24h",
    name: "24h Auto-Briefing Trigger (Meeting Prep + Deal Brief)",
    retries: 1,
    triggers: [{ cron: "0 * * * *" }], // every hour
  },
  async ({ step }) => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // Find meetings in the 24-25h window that have no briefing yet
    const upcoming = await step.run("find-unbriefed-meetings", async () => {
      return db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.activityType, "meeting_scheduled"),
            eq(activities.channel, "meeting"),
            gte(activities.occurredAt, in24h),
            lte(activities.occurredAt, in25h),
            sql`metadata->>'prepDocument' IS NULL`,
            sql`metadata->>'briefingTriggered' IS NULL`
          )
        )
        .limit(50);
    });

    let meetingPrepTriggered = 0;
    let dealBriefTriggered = 0;
    let notificationsSent = 0;

    for (const meeting of upcoming) {
      const meta = (meeting.metadata || {}) as Record<string, unknown>;
      const attendees = (meta.attendees || []) as Array<{
        email?: string;
        displayName?: string;
      }>;

      if (attendees.length === 0) continue;

      // 1. Trigger meeting prep generation (reuses existing flow)
      try {
        await step.run(`trigger-prep-${meeting.id}`, async () => {
          await inngest.send({
            name: "meeting/generate-prep",
            data: {
              activityId: meeting.id,
              tenantId: meeting.tenantId,
            },
          });

          // Mark as triggered so we don't re-process next hour
          await db
            .update(activities)
            .set({
              metadata: {
                ...meta,
                briefingTriggered: new Date().toISOString(),
              },
            })
            .where(eq(activities.id, meeting.id));
        });
        meetingPrepTriggered++;
      } catch (err) {
        console.error(
          `[auto-briefing] Failed to trigger meeting prep for ${meeting.id}:`,
          err
        );
      }

      // 2. Find deals associated with meeting attendees and trigger deal briefs
      try {
        const dealIds = await step.run(
          `find-deals-${meeting.id}`,
          async () => {
            const attendeeEmails = attendees
              .map((a) => a.email)
              .filter((e): e is string => !!e);

            if (attendeeEmails.length === 0) return [];

            // Find contacts matching attendee emails
            const matchedContacts = await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(
                and(
                  eq(contacts.tenantId, meeting.tenantId),
                  inArray(contacts.email, attendeeEmails)
                )
              );

            if (matchedContacts.length === 0) return [];

            // Find open deals linked to those contacts
            const contactIds = matchedContacts.map((c) => c.id);
            const openDeals = await db
              .select({ id: deals.id })
              .from(deals)
              .where(
                and(
                  eq(deals.tenantId, meeting.tenantId),
                  inArray(deals.contactId, contactIds),
                  sql`${deals.stage} NOT IN ('won', 'lost')`
                )
              );

            return openDeals.map((d) => d.id);
          }
        );

        if (dealIds.length > 0) {
          await step.run(`trigger-deal-briefs-${meeting.id}`, async () => {
            await inngest.send({
              name: "deal/brief-requested",
              data: {
                tenantId: meeting.tenantId,
                dealIds,
                scope: "specific" as const,
              },
            });
          });
          dealBriefTriggered += dealIds.length;
        }
      } catch (err) {
        console.error(
          `[auto-briefing] Failed to trigger deal briefs for meeting ${meeting.id}:`,
          err
        );
      }

      // 3. Notify the meeting owner that a briefing is being prepared
      if (meeting.actorId) {
        try {
          await step.run(`notify-${meeting.id}`, async () => {
            await sendNotification({
              tenantId: meeting.tenantId,
              userId: meeting.actorId!,
              type: "meeting_upcoming",
              title: `Briefing ready for: ${meeting.summary || "Upcoming meeting"}`,
              body: `Your meeting in ~24 hours has a prep document being generated. Check the meeting details for talking points, attendee context, and deal status.`,
              entityType: "activity",
              entityId: meeting.id,
            });
          });
          notificationsSent++;
        } catch {
          // Non-critical: don't break the loop for notification failures
        }
      }
    }

    return {
      checked: upcoming.length,
      meetingPrepTriggered,
      dealBriefTriggered,
      notificationsSent,
    };
  }
);
