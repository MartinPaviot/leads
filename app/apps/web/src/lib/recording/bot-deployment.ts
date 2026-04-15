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
import { activities, tenants, users, notetakerExposures } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createBot, type RecallBot } from "@/lib/recall";
import { decideBrandingMode, type BrandingDecision } from "@/lib/recording/branding";

export type DeploymentOutcome =
  | { status: "created"; bot: RecallBot; decision: BrandingDecision }
  | { status: "skipped"; reason: "opted_out" | "missing_link" | "missing_activity" | "already_scheduled"; decision: BrandingDecision | null };

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
