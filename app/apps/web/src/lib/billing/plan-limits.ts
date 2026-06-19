import { db } from "@/db";
import { tenants, contacts, connectedMailboxes } from "@/db/schema";
import { usageEvents } from "@/db/billing-schema";
import { eq, and, gte, isNull, sql } from "drizzle-orm";
import { BILLING_PAGE_ENABLED } from "./page-visibility";

// ── Plan tier definitions ──────────────────────────────────────────
// -1 means unlimited for that resource.

export const PLAN_LIMITS = {
  trial:    { contacts: 100,   emails: 50,   aiQueries: 100, mailboxes: 1 },
  starter:  { contacts: 1000,  emails: 500,  aiQueries: 500, mailboxes: 3 },
  pro:      { contacts: 10000, emails: 5000, aiQueries: -1,  mailboxes: -1 },
  canceled: { contacts: 0,     emails: 0,    aiQueries: 0,   mailboxes: 0 },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;
export type LimitedResource = "contacts" | "emails" | "aiQueries" | "mailboxes";

export interface PlanLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
}

// ── Resolve plan tier from tenant row ──────────────────────────────

function resolvePlan(rawPlan: string | null | undefined): PlanTier {
  const p = (rawPlan ?? "trial").toLowerCase();
  if (p in PLAN_LIMITS) return p as PlanTier;
  return "trial";
}

// ── Count current usage per resource ───────────────────────────────

async function countContacts(tenantId: string): Promise<number> {
  // Exclude soft-deleted contacts. They are invisible in the list and chat
  // (both filter on deletedAt) and must not count against the plan limit — a
  // tenant with 0 visible contacts was blocked at "519/100" by deleted rows.
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
  return result?.count ?? 0;
}

async function countEmailsSentThisMonth(tenantId: string): Promise<number> {
  const start = startOfMonth();
  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.count}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        eq(usageEvents.eventType, "email_sent"),
        gte(usageEvents.createdAt, start),
      ),
    );
  return Number(result?.total ?? 0);
}

async function countAiQueriesThisMonth(tenantId: string): Promise<number> {
  const start = startOfMonth();
  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.count}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        eq(usageEvents.eventType, "ai_query"),
        gte(usageEvents.createdAt, start),
      ),
    );
  return Number(result?.total ?? 0);
}

async function countMailboxes(tenantId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, tenantId));
  return result?.count ?? 0;
}

// ── Main enforcement function ──────────────────────────────────────

export async function checkPlanLimit(
  tenantId: string,
  resource: LimitedResource,
): Promise<PlanLimitResult> {
  // 0. Billing is gated off in prod (BILLING_PAGE_ENABLED, same flag as the
  //    /settings/billing page). While it's off there is no way for a user to
  //    upgrade, so enforcing quotas hard-blocks real usage with no recourse —
  //    e.g. the chat 403'd at 100 AI queries/mo on the default `trial` plan
  //    (no Stripe subscription -> resolvePlan defaults to trial). Don't enforce
  //    until billing is live; flip BILLING_PAGE_ENABLED and limits resume.
  //    (NODE_ENV !== "production" in dev/test, so enforcement stays testable.)
  if (!BILLING_PAGE_ENABLED) {
    return { allowed: true, current: 0, limit: -1, plan: "unmetered" };
  }

  // 1. Read tenant plan
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const plan = resolvePlan(tenant?.plan);
  const limits = PLAN_LIMITS[plan];
  const limit = limits[resource];

  // 2. Unlimited resource (-1) — always allowed
  if (limit === -1) {
    return { allowed: true, current: 0, limit: -1, plan };
  }

  // 3. Count current usage
  let current: number;
  switch (resource) {
    case "contacts":
      current = await countContacts(tenantId);
      break;
    case "emails":
      current = await countEmailsSentThisMonth(tenantId);
      break;
    case "aiQueries":
      current = await countAiQueriesThisMonth(tenantId);
      break;
    case "mailboxes":
      current = await countMailboxes(tenantId);
      break;
  }

  // 4. Compare
  return {
    allowed: current < limit,
    current,
    limit,
    plan,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
