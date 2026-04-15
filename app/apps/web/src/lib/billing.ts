import { db } from "@/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { subscriptions, usageEvents } from "@/db/billing-schema";
import { getTierForPlan, getPlanFromPriceId } from "@/lib/pricing/tiers";

// Quota definitions live in lib/pricing/tiers.ts — don't duplicate them here.
// The helpers below are kept for back-compat with existing callers and the
// API route tests; new code should use lib/pricing/quota.ts instead.

const FEATURE_TO_EVENT: Record<string, string> = {
  // NOTE: "contacts" is resource-based (count of rows) not metered.
  // checkPlanLimit() below has always treated it as a monthly sum of
  // contact_enriched events, which under-counts. The new enforcement layer
  // in lib/pricing/quota.ts uses `count(*) from contacts` instead.
  contacts: "contact_enriched",
  emails: "email_sent",
  ai_queries: "ai_query",
};

// ---------- Helpers ----------

export async function getSubscription(tenantId: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);
  return sub ?? null;
}

export async function isTrialActive(tenantId: string): Promise<boolean> {
  const sub = await getSubscription(tenantId);
  if (!sub) return false;
  if (sub.status !== "trialing") return false;
  if (!sub.trialEnd) return false;
  return new Date(sub.trialEnd) > new Date();
}

/**
 * @deprecated Use lib/pricing/quota.ts assertResource / assertMetered instead.
 * Kept for any pre-existing callers — its "contacts" result is a monthly
 * `contact_enriched` sum, not an accurate count of contact rows.
 */
export async function checkPlanLimit(
  tenantId: string,
  feature: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sub = await getSubscription(tenantId);
  const planName =
    sub?.status === "active" || sub?.status === "trialing"
      ? getPlanFromPriceId(sub.stripePriceId)
      : "trial";

  const limits = getTierForPlan(planName).limits;
  const eventType = FEATURE_TO_EVENT[feature];

  if (!eventType) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  // Get usage for current billing period
  const periodStart = sub?.currentPeriodStart ?? startOfMonth();

  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.count}), 0)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        eq(usageEvents.eventType, eventType as any),
        gte(usageEvents.createdAt, periodStart)
      )
    );

  const current = Number(result?.total ?? 0);
  const limitValue =
    feature === "contacts"
      ? limits.contacts
      : feature === "emails"
        ? limits.emailsPerMonth
        : limits.aiQueriesPerMonth;

  return {
    allowed: current < limitValue,
    current,
    limit: limitValue,
  };
}

export async function trackUsage(
  tenantId: string,
  eventType: "api_call" | "email_sent" | "contact_enriched" | "ai_query",
  count: number = 1
) {
  await db.insert(usageEvents).values({
    tenantId,
    eventType,
    count,
  });
}

// ---------- Internal ----------

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
