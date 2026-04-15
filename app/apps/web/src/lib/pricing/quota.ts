/**
 * Plan quota enforcement.
 *
 * Two kinds of quotas exist and they need different reads:
 *
 *   - Resource-based ("contacts"): the check is `count(*) from contacts`
 *     because contacts don't reset monthly — they're things the tenant owns.
 *     A tenant at 1000 contacts can't create a 1001st even if they added
 *     all of them last year.
 *
 *   - Metered ("emails", "ai_queries"): the check is `sum(count) from
 *     usage_events` filtered by event_type and `created_at >= periodStart`.
 *     These reset with the billing period.
 *
 * The old `lib/billing.ts#checkPlanLimit` counted contacts the metered way
 * (sum of `contact_enriched` events), which was a silent under-count since
 * it missed manually-created contacts and imports. That code is still there
 * for back-compat but is @deprecated; new call sites use this module.
 */

import { db } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { contacts, tenants } from "@/db/schema";
import { subscriptions, usageEvents } from "@/db/billing-schema";
import {
  getLimitsForTenant,
  getPlanFromPriceId,
  type PlanId,
  type TierLimits,
} from "@/lib/pricing/tiers";

export type MeteredKind = "emails" | "ai_queries";
export type ResourceKind = "contacts";
export type QuotaKind = MeteredKind | ResourceKind;

const EVENT_TYPE_FOR: Record<MeteredKind, "email_sent" | "ai_query"> = {
  emails: "email_sent",
  ai_queries: "ai_query",
};

const LIMIT_KEY_FOR: Record<QuotaKind, keyof TierLimits> = {
  contacts: "contacts",
  emails: "emailsPerMonth",
  ai_queries: "aiQueriesPerMonth",
};

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded" as const;
  constructor(
    readonly feature: QuotaKind,
    readonly current: number,
    readonly limit: number,
    readonly plan: string
  ) {
    super(
      `Quota exceeded for ${feature}: ${current}/${limit} on plan ${plan}`
    );
    this.name = "QuotaExceededError";
  }
}

interface ResolvedTenantContext {
  plan: PlanId;
  limits: TierLimits;
  periodStart: Date;
  periodEnd: Date | null;
}

/**
 * Resolve a tenant's effective plan (from subscription) and limits (from plan
 * defaults merged with tenants.quota_overrides). Period boundaries come from
 * the active subscription when live, else calendar month.
 *
 * Never throws on missing rows — unknown / trial-only tenants resolve to the
 * trial tier with a month-aligned period.
 */
async function resolveContext(tenantId: string): Promise<ResolvedTenantContext> {
  // Subscription → plan + period (may be null for tenants who never checked out)
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);

  let plan: PlanId;
  if (sub?.status === "canceled") {
    plan = "canceled";
  } else if (sub?.status === "active" || sub?.status === "trialing") {
    plan = getPlanFromPriceId(sub.stripePriceId);
  } else {
    plan = "trial";
  }

  // Tenant → overrides
  const [tenant] = await db
    .select({ plan: tenants.plan, overrides: tenants.quotaOverrides })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  // Use webhook-maintained tenants.plan when the subscriptions row is absent.
  // This handles tenants that were manually set to a plan via DB for testing.
  if (!sub && tenant?.plan) {
    const p = tenant.plan as string;
    if (p === "starter" || p === "pro" || p === "canceled" || p === "trial") {
      plan = p;
    }
  }

  const limits = getLimitsForTenant(
    plan,
    (tenant?.overrides ?? null) as Partial<Record<keyof TierLimits, number | null>> | null
  );

  const periodStart =
    sub?.currentPeriodStart ?? startOfCalendarMonth();
  const periodEnd = sub?.currentPeriodEnd ?? null;

  return { plan, limits, periodStart, periodEnd };
}

function startOfCalendarMonth(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

/** Read a tenant's current usage across every tracked quota kind. */
export async function readUsage(tenantId: string): Promise<{
  plan: PlanId;
  periodStart: Date;
  periodEnd: Date | null;
  limits: TierLimits;
  usage: Record<QuotaKind, number>;
}> {
  const ctx = await resolveContext(tenantId);

  const [contactRow] = await db
    .select({ n: sql<number>`coalesce(count(*), 0)::int` })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));

  const meteredRows = await db
    .select({
      eventType: usageEvents.eventType,
      total: sql<number>`coalesce(sum(${usageEvents.count}), 0)::int`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        gte(usageEvents.createdAt, ctx.periodStart)
      )
    )
    .groupBy(usageEvents.eventType);

  const meteredMap = new Map<string, number>();
  for (const r of meteredRows) meteredMap.set(r.eventType, Number(r.total));

  return {
    plan: ctx.plan,
    periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd,
    limits: ctx.limits,
    usage: {
      contacts: Number(contactRow?.n ?? 0),
      emails: meteredMap.get(EVENT_TYPE_FOR.emails) ?? 0,
      ai_queries: meteredMap.get(EVENT_TYPE_FOR.ai_queries) ?? 0,
    },
  };
}

/**
 * Assert that a tenant has headroom for a resource-based action.
 *
 * @param addingCount How many new rows are about to be inserted (default 1).
 *   Bulk imports pass the batch size so we reject atomically rather than
 *   letting the tenant insert up to the limit then fail on the overflow row.
 */
export async function assertResource(
  tenantId: string,
  kind: ResourceKind,
  opts: { addingCount?: number } = {}
): Promise<void> {
  const addingCount = opts.addingCount ?? 1;
  const ctx = await resolveContext(tenantId);
  const limit = ctx.limits[LIMIT_KEY_FOR[kind]];
  if (!Number.isFinite(limit)) return;

  const [row] = await db
    .select({ n: sql<number>`coalesce(count(*), 0)::int` })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  const current = Number(row?.n ?? 0);

  if (current + addingCount > limit) {
    throw new QuotaExceededError(kind, current, limit, ctx.plan);
  }
}

/**
 * Assert that a tenant has headroom for a metered action in the current
 * billing period. Read-only — the caller increments usage_events via
 * `trackUsage` (in lib/billing.ts) after the action succeeds.
 */
export async function assertMetered(
  tenantId: string,
  kind: MeteredKind
): Promise<void> {
  const ctx = await resolveContext(tenantId);
  const limit = ctx.limits[LIMIT_KEY_FOR[kind]];
  if (!Number.isFinite(limit)) return;

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.count}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        eq(usageEvents.eventType, EVENT_TYPE_FOR[kind]),
        gte(usageEvents.createdAt, ctx.periodStart)
      )
    );
  const current = Number(row?.total ?? 0);

  if (current >= limit) {
    throw new QuotaExceededError(kind, current, limit, ctx.plan);
  }
}
