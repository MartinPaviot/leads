import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities, deals } from "@/db/schema";
import { eq, and, sql, desc, lt, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actions: { action: string; why: string; priority: "critical" | "high" | "medium" | "low"; category: string; entityType?: string; entityId?: string }[] = [];

  // Shared date thresholds
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // 1. Follow-up needed: contacts with positive sentiment + last activity > 5 days ago
  const followUps = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      companyName: companies.name,
      lastActivity: sql<Date>`max(${activities.occurredAt})`,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .innerJoin(activities, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
    ))
    .where(and(
      eq(contacts.tenantId, authCtx.tenantId),
      eq(activities.sentiment, "positive"),
    ))
    .groupBy(contacts.id, contacts.firstName, contacts.lastName, companies.name)
    .having(sql`max(${activities.occurredAt}) < ${fiveDaysAgo.toISOString()}::timestamp`)
    .orderBy(desc(sql`max(${activities.occurredAt})`))
    .limit(3);

  for (const fu of followUps) {
    const name = [fu.firstName, fu.lastName].filter(Boolean).join(" ");
    const daysSince = Math.floor((Date.now() - new Date(fu.lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    actions.push({
      action: `Follow up with ${name}${fu.companyName ? ` at ${fu.companyName}` : ""}`,
      why: `Positive sentiment, no reply in ${daysSince} days`,
      priority: daysSince > 10 ? "critical" : "high",
      category: "follow_up",
      entityType: "contact",
      entityId: fu.contactId,
    });
  }

  // 2. Questions pending: activities with "question" in intent array in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const questions = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      summary: activities.summary,
    })
    .from(activities)
    .innerJoin(contacts, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
    ))
    .where(and(
      eq(activities.tenantId, authCtx.tenantId),
      sql`'question' = ANY(${activities.intent})`,
      sql`${activities.occurredAt} > ${sevenDaysAgo.toISOString()}::timestamp`,
      eq(activities.direction, "inbound"),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(2);

  for (const q of questions) {
    const name = [q.firstName, q.lastName].filter(Boolean).join(" ");
    actions.push({
      action: `Reply to ${name}'s question`,
      why: `They asked: "${q.summary}"`,
      priority: "high",
      category: "follow_up",
      entityType: "contact",
      entityId: q.contactId,
    });
  }

  // 3. Budget mentions: contacts who mentioned budget in last 14 days
  const budgetMentions = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      companyName: companies.name,
      summary: activities.summary,
    })
    .from(activities)
    .innerJoin(contacts, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
    ))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(
      eq(activities.tenantId, authCtx.tenantId),
      sql`'budget_mention' = ANY(${activities.intent})`,
      sql`${activities.occurredAt} > ${fourteenDaysAgo.toISOString()}::timestamp`,
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(2);

  for (const bm of budgetMentions) {
    const name = [bm.firstName, bm.lastName].filter(Boolean).join(" ");
    actions.push({
      action: `Send pricing to ${name}${bm.companyName ? ` at ${bm.companyName}` : ""} — they mentioned budget`,
      why: bm.summary || "Budget discussion detected in recent conversation",
      priority: "high",
      category: "follow_up",
      entityType: "contact",
      entityId: bm.contactId,
    });
  }

  // 4. Unenriched companies
  const [unenrichedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(
      eq(companies.tenantId, authCtx.tenantId),
      sql`${companies.properties}->>'enrichment_source' IS NULL OR ${companies.properties}->>'enrichment_source' = 'llm_only'`,
    ));

  if ((unenrichedCount?.count || 0) > 0) {
    actions.push({
      action: `Enrich ${unenrichedCount?.count} companies`,
      why: "Enrichment improves scoring accuracy and unlocks signals",
      priority: "medium",
      category: "research",
    });
  }

  // 5. Stalled deals (stage not won/lost, no update in 14+ days)
  const stalledDeals = await db
    .select({
      dealId: deals.id,
      dealName: deals.name,
      stage: deals.stage,
      value: deals.value,
    })
    .from(deals)
    .where(and(
      eq(deals.tenantId, authCtx.tenantId),
      sql`${deals.stage} NOT IN ('won', 'lost')`,
      lt(deals.updatedAt, fourteenDaysAgo),
    ))
    .limit(2);

  for (const deal of stalledDeals) {
    actions.push({
      action: `Revive stalled deal: ${deal.dealName}`,
      why: `${deal.stage} stage, no activity in 14+ days${deal.value ? `, $${deal.value} at risk` : ""}`,
      priority: "critical",
      category: "rescue",
      entityType: "deal",
      entityId: deal.dealId,
    });
  }

  // 6. Warm matches to review (TAM companies with email-synced contacts, unscored)
  const [warmCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${companies.id})` })
    .from(companies)
    .innerJoin(contacts, eq(contacts.companyId, companies.id))
    .where(and(
      eq(companies.tenantId, authCtx.tenantId),
      sql`${companies.properties}->>'source' = 'tam'`,
      sql`${contacts.properties}->>'source' = 'email_sync'`,
      isNull(companies.score),
    ));

  if ((warmCount?.count || 0) > 0) {
    actions.push({
      action: `Review ${warmCount?.count} warm matches`,
      why: "TAM prospects you're already talking to — score and prioritize them",
      priority: "high",
      category: "research",
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return NextResponse.json({ actions: actions.slice(0, 5) });
}
