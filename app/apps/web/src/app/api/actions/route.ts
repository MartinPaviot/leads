import { NextResponse } from "next/server";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities, deals } from "@/db/schema";
import { eq, and, sql, desc, lt, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {

  const actions: {
    action: string;
    why: string;
    priority: "critical" | "high" | "medium" | "low";
    category: string;
    entityType?: string;
    entityId?: string;
    contactEmail?: string;
    contactTitle?: string;
    companyName?: string;
    companyDomain?: string;
    dealValue?: number;
    dealStage?: string;
    daysSilent?: number;
    lastEmailSubject?: string;
    lastEmailSnippet?: string;
  }[] = [];

  // Shared date thresholds
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // 1. Follow-up needed: contacts with positive sentiment + last activity > 5 days ago
  const followUps = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      title: contacts.title,
      companyName: companies.name,
      companyDomain: companies.domain,
      lastActivity: sql<Date>`max(${activities.occurredAt})`,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .innerJoin(activities, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
      isNull(activities.deletedAt),
    ))
    .where(and(
      eq(contacts.tenantId, authCtx.tenantId),
      eq(activities.sentiment, "positive"),
      isNull(contacts.deletedAt),
    ))
    .groupBy(contacts.id, contacts.firstName, contacts.lastName, contacts.email, contacts.title, companies.name, companies.domain)
    .having(sql`max(${activities.occurredAt}) < ${fiveDaysAgo.toISOString()}::timestamp`)
    .orderBy(desc(sql`max(${activities.occurredAt})`))
    .limit(3);

  // Batch fetch last email for all follow-up contacts (1 query instead of N)
  const followUpContactIds = followUps.map((fu) => fu.contactId);
  const lastEmails: Record<string, { summary: string | null; rawContent: unknown }> = {};
  if (followUpContactIds.length > 0) {
    const emailResults = await db
      .select({
        entityId: activities.entityId,
        summary: activities.summary,
        rawContent: activities.rawContent,
        rn: sql<number>`row_number() over (partition by ${activities.entityId} order by ${activities.occurredAt} desc)`,
      })
      .from(activities)
      .where(and(
        eq(activities.tenantId, authCtx.tenantId),
        eq(activities.entityType, "contact"),
        sql`${activities.entityId} IN (${sql.join(followUpContactIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${activities.activityType} IN ('email_sent', 'email_received')`,
        isNull(activities.deletedAt),
      ));
    for (const e of emailResults) {
      if ((e as any).rn === 1 || !lastEmails[e.entityId!]) {
        lastEmails[e.entityId!] = { summary: e.summary, rawContent: e.rawContent };
      }
    }
  }

  for (const fu of followUps) {
    const name = [fu.firstName, fu.lastName].filter(Boolean).join(" ");
    const daysSince = Math.floor((Date.now() - new Date(fu.lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    const lastEmail = lastEmails[fu.contactId];

    actions.push({
      action: `Follow up with ${name}${fu.companyName ? ` at ${fu.companyName}` : ""}`,
      why: `Positive sentiment, no reply in ${daysSince} days`,
      priority: daysSince > 10 ? "critical" : "high",
      category: "follow_up",
      entityType: "contact",
      entityId: fu.contactId,
      contactEmail: fu.email || undefined,
      contactTitle: fu.title || undefined,
      companyName: fu.companyName || undefined,
      companyDomain: fu.companyDomain || undefined,
      daysSilent: daysSince,
      lastEmailSubject: lastEmail?.summary || undefined,
      lastEmailSnippet: lastEmail?.rawContent ? String(lastEmail.rawContent).slice(0, 200) : undefined,
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
      isNull(contacts.deletedAt),
    ))
    .where(and(
      eq(activities.tenantId, authCtx.tenantId),
      sql`'question' = ANY(${activities.intent})`,
      sql`${activities.occurredAt} > ${sevenDaysAgo.toISOString()}::timestamp`,
      eq(activities.direction, "inbound"),
      isNull(activities.deletedAt),
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
      isNull(contacts.deletedAt),
    ))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(
      eq(activities.tenantId, authCtx.tenantId),
      sql`'budget_mention' = ANY(${activities.intent})`,
      sql`${activities.occurredAt} > ${fourteenDaysAgo.toISOString()}::timestamp`,
      isNull(activities.deletedAt),
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
      isNull(companies.deletedAt),
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
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(and(
      eq(deals.tenantId, authCtx.tenantId),
      sql`${deals.stage} NOT IN ('won', 'lost')`,
      lt(deals.updatedAt, fourteenDaysAgo),
      isNull(deals.deletedAt),
    ))
    .limit(2);

  for (const deal of stalledDeals) {
    const stalledDays = deal.updatedAt ? Math.floor((Date.now() - new Date(deal.updatedAt as unknown as string).getTime()) / (1000 * 60 * 60 * 24)) : 14;
    actions.push({
      action: `Revive stalled deal: ${deal.dealName}`,
      why: `${deal.stage} stage, silent ${stalledDays} days${deal.value ? `, $${deal.value.toLocaleString()} at risk` : ""}`,
      priority: "critical",
      category: "rescue",
      entityType: "deal",
      entityId: deal.dealId,
      dealValue: deal.value || undefined,
      dealStage: deal.stage || undefined,
      daysSilent: stalledDays,
    });
  }

  // 6. Warm matches to review (TAM companies with email-synced contacts, unscored)
  const [warmCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${companies.id})` })
    .from(companies)
    .innerJoin(contacts, and(eq(contacts.companyId, companies.id), isNull(contacts.deletedAt)))
    .where(and(
      eq(companies.tenantId, authCtx.tenantId),
      sql`${companies.properties}->>'source' = 'tam'`,
      sql`${contacts.properties}->>'source' = 'email_sync'`,
      isNull(companies.score),
      isNull(companies.deletedAt),
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
  });
}
