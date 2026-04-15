/**
 * WS-1: notetaker-channel attribution at signup.
 *
 * When a new tenant is created, look up whether the owner's email has been
 * exposed to an Elevay-branded meeting bot in the last 90 days. If so,
 * credit the referring tenant and annotate the new tenant's settings so we
 * can measure the K-factor of the recorder as an acquisition channel.
 */

import { db } from "@/db";
import {
  tenants,
  notetakerExposures,
  tenantReferralCredits,
  referralCreditEvents,
} from "@/db/schema";
import { eq, and, isNull, gte, sql } from "drizzle-orm";
import { normalizeEmail } from "@/lib/util/email";

const ATTRIBUTION_WINDOW_DAYS = 90;
const CREDIT_THRESHOLD = 3; // every 3 attributions → 1 referral credit granted

export type AttributionResult =
  | { status: "attributed"; referringTenantId: string; exposureId: string; exposureCount: number; firstExposureAt: Date; creditGranted: boolean }
  | { status: "no_match" }
  | { status: "skipped"; reason: string };

export async function attributeSignupFromExposure(
  newTenantId: string,
  ownerEmail: string
): Promise<AttributionResult> {
  if (process.env.WS1_CHANNEL_ENABLED === "false") {
    return { status: "skipped", reason: "feature_flag_off" };
  }

  let normalized: string;
  try {
    normalized = normalizeEmail(ownerEmail);
  } catch {
    return { status: "skipped", reason: "invalid_email" };
  }

  const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 3600 * 1000);

  const matches = await db
    .select()
    .from(notetakerExposures)
    .where(
      and(
        eq(notetakerExposures.participantEmailNormalized, normalized),
        eq(notetakerExposures.brandingMode, "full"),
        gte(notetakerExposures.exposureAt, windowStart),
        isNull(notetakerExposures.signupAttributedTenantId)
      )
    )
    .orderBy(notetakerExposures.exposureAt);

  if (matches.length === 0) return { status: "no_match" };

  const oldest = matches[0];
  const referringTenantId = oldest.referringTenantId;
  const now = new Date();

  // Atomic: claim the exposure (prevents double-attribution under race)
  const [claimed] = await db
    .update(notetakerExposures)
    .set({ signupAttributedTenantId: newTenantId, signupAttributedAt: now })
    .where(
      and(
        eq(notetakerExposures.id, oldest.id),
        isNull(notetakerExposures.signupAttributedTenantId)
      )
    )
    .returning();

  if (!claimed) {
    // Lost the race — another concurrent signup attribution took this exposure
    return { status: "no_match" };
  }

  // Annotate the new tenant
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, newTenantId)).limit(1);
  const existingSettings = (tenant?.settings ?? {}) as Record<string, unknown>;
  await db
    .update(tenants)
    .set({
      settings: {
        ...existingSettings,
        acquisitionSource: "notetaker_exposure",
        referringTenantId,
        exposureCount: matches.length,
        firstExposureAt: oldest.exposureAt.toISOString(),
      },
    })
    .where(eq(tenants.id, newTenantId));

  // Ledger event
  await db.insert(referralCreditEvents).values({
    tenantId: referringTenantId,
    eventType: "attribution_earned",
    triggeredByAttributionTenantId: newTenantId,
    triggeredByExposureId: oldest.id,
    amountCents: 0,
    description: `Signup of ${newTenantId} attributed from exposure at ${oldest.exposureAt.toISOString()}`,
  });

  // Credit counter: upsert tenant_referral_credits, then check threshold
  const creditGranted = await maybeGrantCredit(referringTenantId);

  return {
    status: "attributed",
    referringTenantId,
    exposureId: oldest.id,
    exposureCount: matches.length,
    firstExposureAt: oldest.exposureAt,
    creditGranted,
  };
}

async function maybeGrantCredit(referringTenantId: string): Promise<boolean> {
  // Count attributions earned SINCE the last credit_granted event for this tenant
  const lastCredit = await db
    .select()
    .from(referralCreditEvents)
    .where(
      and(
        eq(referralCreditEvents.tenantId, referringTenantId),
        eq(referralCreditEvents.eventType, "credit_granted")
      )
    )
    .orderBy(sql`${referralCreditEvents.createdAt} DESC`)
    .limit(1);

  const sinceClause = lastCredit[0]
    ? gte(referralCreditEvents.createdAt, lastCredit[0].createdAt)
    : undefined;

  const attributions = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralCreditEvents)
    .where(
      and(
        eq(referralCreditEvents.tenantId, referringTenantId),
        eq(referralCreditEvents.eventType, "attribution_earned"),
        ...(sinceClause ? [sinceClause] : [])
      )
    );

  const count = attributions[0]?.c ?? 0;
  if (count < CREDIT_THRESHOLD) return false;

  await db.insert(referralCreditEvents).values({
    tenantId: referringTenantId,
    eventType: "credit_granted",
    amountCents: 0, // amount is symbolic; downstream billing applies the comp
    description: `1-month free credit granted (after ${count} attributions)`,
  });

  // Upsert the counter row
  await db
    .insert(tenantReferralCredits)
    .values({
      tenantId: referringTenantId,
      creditsEarnedCount: 1,
      lastCreditEarnedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tenantReferralCredits.tenantId,
      set: {
        creditsEarnedCount: sql`${tenantReferralCredits.creditsEarnedCount} + 1`,
        lastCreditEarnedAt: new Date(),
      },
    });

  return true;
}
