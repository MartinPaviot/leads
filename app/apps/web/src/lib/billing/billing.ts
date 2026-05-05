import { db } from "@/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { subscriptions, usageEvents } from "@/db/billing-schema";

// ---------- Plan limits ----------

type PlanId = "trial" | "starter" | "pro";

interface PlanLimits {
  contacts: number;
  emailsPerMonth: number;
  aiQueriesPerMonth: number;
}

const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: { contacts: 100, emailsPerMonth: 50, aiQueriesPerMonth: 100 },
  starter: { contacts: 1000, emailsPerMonth: 500, aiQueriesPerMonth: 500 },
  pro: { contacts: 10000, emailsPerMonth: 5000, aiQueriesPerMonth: Infinity },
};

const FEATURE_TO_EVENT: Record<string, string> = {
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

export async function checkPlanLimit(
  tenantId: string,
  feature: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sub = await getSubscription(tenantId);
  const plan: PlanId =
    sub?.status === "active" || sub?.status === "trialing"
      ? getPlanFromPrice(sub.stripePriceId)
      : "trial";

  const limits = PLAN_LIMITS[plan];
  const eventType = FEATURE_TO_EVENT[feature];

  if (!eventType || !limits) {
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

function getPlanFromPrice(priceId: string | null): PlanId {
  if (!priceId) return "trial";
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return "trial";
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
