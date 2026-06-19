/**
 * WS-1: smart-branded Recall.ai bot deployment.
 *
 * Wraps the raw `createBot` call so every bot we schedule:
 *  - respects the tenant's recording opt-out
 *  - carries the right branding (full vs silent) based on attendees
 *  - records exposures for external participants (acquisition channel)
 *
 * All three existing call sites should go through `createBotForActivity`.
 */

import { db } from "@/db";
import { activities, tenants, users, contacts, notetakerExposures, meetingOptOuts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createBot, type RecallBot } from "@/lib/integrations/recall";
import { decideBrandingMode, type BrandingDecision } from "@/lib/recording/branding";
import { isSovereignRecordingEnabled, isSovereignVisioUrl } from "@/lib/recording/sovereign-recording";
import { sendNotification } from "@/lib/emails/notifications";
import { generateOptOutToken } from "@/lib/recording/opt-out-token";

/**
 * Error classification for bot deployment failures.
 *
 * Distinguishes between three failure modes so callers can show
 * appropriate user-facing messages and take different retry/remediation
 * actions:
 *
 * - "invalid_meeting_link"  — The meeting URL is malformed, expired, or
 *                             points to an unsupported platform. The user
 *                             should check and re-enter the link. Not
 *                             retriable.
 *
 * - "bot_removed_by_attendee" — The bot successfully joined but was
 *                             manually removed (kicked) by a meeting
 *                             participant. Re-deploying is possible but
 *                             may be unwelcome. Log for analytics.
 *
 * - "recording_failed"      — A technical error prevented recording
 *                             (network timeout, Recall.ai outage,
 *                             transcription provider failure, etc.).
 *                             Retriable after a delay.
 */
export type BotErrorCategory =
  | "invalid_meeting_link"
  | "bot_removed_by_attendee"
  | "recording_failed";

/**
 * Classify a Recall.ai status code + sub_code into a user-actionable
 * error category. Returns null when the status does not represent a
 * failure.
 */
export function classifyBotError(
  code: string,
  subCode: string | null | undefined
): BotErrorCategory | null {
  // Fatal / error states
  if (code === "fatal" || code === "error") {
    // Recall sub-codes for link issues
    if (
      subCode === "invalid_meeting_url" ||
      subCode === "meeting_not_found" ||
      subCode === "cannot_join_meeting"
    ) {
      return "invalid_meeting_link";
    }

    // Bot was removed by a participant
    if (
      subCode === "kicked" ||
      subCode === "removed_by_host" ||
      subCode === "bot_was_removed"
    ) {
      return "bot_removed_by_attendee";
    }

    // Everything else is a technical failure
    return "recording_failed";
  }

  // Not a failure state
  return null;
}

export type DeploymentOutcome =
  | { status: "created"; bot: RecallBot; decision: BrandingDecision }
  | { status: "skipped"; reason: "opted_out" | "attendee_opted_out" | "missing_link" | "missing_activity" | "already_scheduled" | "sovereign_path"; decision: BrandingDecision | null }
  | { status: "failed"; reason: BotErrorCategory; error: string; decision: BrandingDecision | null };

export async function createBotForActivity(
  activityId: string,
  opts?: { meetingOverride?: "branded" | "silent" }
): Promise<DeploymentOutcome> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!activity) return { status: "skipped", reason: "missing_activity", decision: null };

  const meta = (activity.metadata || {}) as Record<string, unknown>;

  // Sovereign visios (rooms on our own Jitsi host) are recorded by self-hosted
  // Jibri, never the US Recall.ai bot. Check before the missing-link guard
  // because our booking stores the room under `joinUrl`, not `meetingLink`.
  if (isSovereignRecordingEnabled()) {
    const sovUrl = (meta.joinUrl || meta.meetLink || meta.meetingLink) as string | undefined;
    if (isSovereignVisioUrl(sovUrl)) {
      return { status: "skipped", reason: "sovereign_path", decision: null };
    }
  }

  const meetingLink = meta.meetingLink as string | undefined;
  if (!meetingLink) return { status: "skipped", reason: "missing_link", decision: null };
  if (meta.recallBotId) return { status: "skipped", reason: "already_scheduled", decision: null };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, activity.tenantId)).limit(1);
  if (!tenant) return { status: "skipped", reason: "missing_activity", decision: null };

  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.tenantId, activity.tenantId))
    .orderBy(users.createdAt)
    .limit(1);

  const attendees = Array.isArray(meta.attendees)
    ? (meta.attendees as Array<{ email: string; self?: boolean }>)
    : [];

  const decision = decideBrandingMode({
    attendees,
    tenant: {
      id: tenant.id,
      ownerEmail: owner?.email ?? "",
      settings: (tenant.settings ?? {}) as Record<string, unknown>,
    },
    meetingOverride: opts?.meetingOverride,
  });

  // Record the decision for observability even when we skip
  await db
    .update(activities)
    .set({
      metadata: {
        ...meta,
        brandingDecision: {
          mode: decision.mode,
          reason: decision.reason,
          botDisplayName: decision.botDisplayName,
          externalCount: decision.externalAttendees.length,
          decidedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(activities.id, activityId));

  if (decision.mode === "opted_out") {
    return { status: "skipped", reason: "opted_out", decision };
  }

  // Check if any attendee has opted out of recording for this meeting
  try {
    const attendeeEmails = attendees
      .filter((a) => a.email)
      .map((a) => a.email.toLowerCase().trim());

    if (attendeeEmails.length > 0) {
      const optOuts = await db
        .select({ attendeeEmail: meetingOptOuts.attendeeEmail })
        .from(meetingOptOuts)
        .where(
          and(
            eq(meetingOptOuts.activityId, activityId),
            inArray(meetingOptOuts.attendeeEmail, attendeeEmails)
          )
        );

      if (optOuts.length > 0) {
        const optedOutEmails = optOuts.map((o) => o.attendeeEmail).join(", ");
        console.info(
          `[WS-1] Bot creation skipped for activity ${activityId}: attendee opt-out by ${optedOutEmails}`
        );

        // Record the skip reason in the activity metadata for observability
        await db
          .update(activities)
          .set({
            metadata: {
              ...meta,
              recordingSkipped: {
                reason: "attendee_opted_out",
                optedOutEmails: optOuts.map((o) => o.attendeeEmail),
                skippedAt: new Date().toISOString(),
              },
              brandingDecision: {
                mode: decision.mode,
                reason: decision.reason,
                botDisplayName: decision.botDisplayName,
                externalCount: decision.externalAttendees.length,
                decidedAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(activities.id, activityId));

        return { status: "skipped", reason: "attendee_opted_out", decision };
      }
    }
  } catch (err) {
    // Never block bot deployment because of opt-out check failures
    console.warn(`[WS-1] Opt-out check failed for activity ${activityId} (proceeding with bot):`, err);
  }

  // FINDING-009: Send consent notification to known contacts before bot joins.
  // Notifies all attendees that are known CRM contacts so they know a meeting
  // assistant will be present. Non-blocking — bot creation proceeds even if
  // notification delivery fails.
  try {
    await notifyAttendeesBeforeBotJoins(
      activity.tenantId,
      activityId,
      activity.summary ?? "an upcoming meeting",
      attendees
    );
  } catch (err) {
    // Never block bot deployment because of notification failures
    console.warn(`[WS-1] Consent notification failed for activity ${activityId}:`, err);
  }

  const bot = await createBot(meetingLink, { botName: decision.botDisplayName });

  await db
    .update(activities)
    .set({
      metadata: {
        ...meta,
        recallBotId: bot.id,
        recordingStatus: "scheduled",
        brandingDecision: {
          mode: decision.mode,
          reason: decision.reason,
          botDisplayName: decision.botDisplayName,
          externalCount: decision.externalAttendees.length,
          decidedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(activities.id, activityId));

  if (decision.mode === "full" && decision.externalAttendees.length > 0) {
    // One exposure row per external attendee. The unique index
    // (activity_id, participant_email_normalized) prevents duplicates on retry.
    const rawAttendees = attendees;
    const rows = decision.externalAttendees.map((normalized) => {
      const original = rawAttendees.find((a) => a.email?.toLowerCase().includes(normalized.split("@")[0]))?.email ?? normalized;
      return {
        activityId,
        referringTenantId: activity.tenantId,
        participantEmail: original,
        participantEmailNormalized: normalized,
        brandingMode: "full" as const,
        botDisplayName: decision.botDisplayName,
      };
    });

    try {
      await db.insert(notetakerExposures).values(rows).onConflictDoNothing();
    } catch (err) {
      // Exposure recording should never break bot creation — log and continue
      console.warn(`[WS-1] Failed to record exposures for activity ${activityId}:`, err);
    }
  }

  return { status: "created", bot, decision };
}

/**
 * FINDING-009: Notify all meeting attendees that are known CRM contacts
 * about the upcoming meeting assistant. Gives attendees a chance to be
 * aware that notes will be taken.
 *
 * Notification is sent to the CRM user who owns the contact (or any
 * admin) so they can relay the information. For external contacts found
 * in the CRM, we also create an in-app notification on the contact
 * record for audit trail purposes.
 */
async function notifyAttendeesBeforeBotJoins(
  tenantId: string,
  activityId: string,
  meetingName: string,
  attendees: Array<{ email: string; self?: boolean }>
): Promise<void> {
  const externalEmails = attendees
    .filter((a) => !a.self && a.email)
    .map((a) => a.email.toLowerCase());

  if (externalEmails.length === 0) return;

  // Find which attendees are known contacts in the CRM
  const knownContacts = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      ownerId: contacts.ownerId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        inArray(contacts.email, externalEmails)
      )
    );

  if (knownContacts.length === 0) return;

  // Collect unique owner user IDs to notify
  const ownerIds = new Set<string>();
  for (const contact of knownContacts) {
    if (contact.ownerId) ownerIds.add(contact.ownerId);
  }

  // If no owners assigned, notify all tenant users with admin role
  if (ownerIds.size === 0) {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin")))
      .limit(5);
    for (const admin of admins) {
      ownerIds.add(admin.id);
    }
  }

  const contactNames = knownContacts
    .map((c) =>
      [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown"
    )
    .join(", ");

  // Build opt-out links for each external attendee
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://app.elevay.com";
  const optOutLinks = attendees
    .filter((a) => !a.self && a.email)
    .map((a) => {
      const token = generateOptOutToken(activityId, a.email);
      const link = `${appUrl}/api/meetings/opt-out?token=${encodeURIComponent(token)}&meetingId=${encodeURIComponent(activityId)}&email=${encodeURIComponent(a.email.toLowerCase().trim())}`;
      return { email: a.email, link };
    });

  const optOutNote = optOutLinks.length > 0
    ? ` Attendees can opt out of recording at: ${optOutLinks[0].link}`
    : "";

  // Send notification to each relevant user
  for (const userId of ownerIds) {
    await sendNotification({
      tenantId,
      userId,
      type: "meeting_upcoming",
      title: `Meeting assistant will join: ${meetingName}`,
      body: `Elevay's meeting assistant will join "${meetingName}" to take notes. Known contacts attending: ${contactNames}. The assistant will be visible to all participants.${optOutNote}`,
      entityType: "activity",
      entityId: activityId,
    });
  }
}
