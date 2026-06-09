import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities, deals } from "@/db/schema";
import { eq, and, sql, desc, lt, isNull } from "drizzle-orm";
import { analyzeFollowUpTiming } from "@/lib/util/follow-up-timing";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const recommendations: {
      title: string;
      description: string;
      urgency: number; // 1-5, 1 = most urgent
      entityType: string;
      entityId: string;
      suggestedAction: string;
    }[] = [];

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 1. Budget/timeline mentions → highest urgency
    const budgetMentions = await db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyName: companies.name,
        summary: activities.summary,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .innerJoin(contacts, and(eq(activities.entityId, contacts.id), eq(activities.entityType, "contact"), isNull(contacts.deletedAt)))
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(
        eq(activities.tenantId, authCtx.tenantId),
        sql`${activities.intent} && ARRAY['budget_mention', 'timeline_mention']::text[]`,
        sql`${activities.occurredAt} > ${sevenDaysAgo.toISOString()}::timestamp`,
        eq(activities.direction, "inbound"),
        isNull(activities.deletedAt),
      ))
      .orderBy(desc(activities.occurredAt))
      .limit(2);

    for (const b of budgetMentions) {
      const name = [b.firstName, b.lastName].filter(Boolean).join(" ");
      recommendations.push({
        title: `${name} mentioned budget/timeline`,
        description: `Re: "${b.summary}"${b.companyName ? ` at ${b.companyName}` : ""}`,
        urgency: 1,
        entityType: "contact",
        entityId: b.contactId,
        suggestedAction: "Send pricing proposal or confirm timeline",
      });
    }

    // 2. Positive contacts going cold
    const warmGoingCold = await db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyName: companies.name,
        lastActivity: sql<Date>`max(${activities.occurredAt})`,
        positiveCount: sql<number>`count(CASE WHEN ${activities.sentiment} = 'positive' THEN 1 END)`,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .innerJoin(activities, and(eq(activities.entityId, contacts.id), eq(activities.entityType, "contact"), isNull(activities.deletedAt)))
      .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .groupBy(contacts.id, contacts.firstName, contacts.lastName, companies.name)
      .having(and(
        sql`count(CASE WHEN ${activities.sentiment} = 'positive' THEN 1 END) > 0`,
        sql`max(${activities.occurredAt}) < ${fiveDaysAgo.toISOString()}::timestamp`,
      ))
      .orderBy(desc(sql`max(${activities.occurredAt})`))
      .limit(2);

    for (const w of warmGoingCold) {
      const name = [w.firstName, w.lastName].filter(Boolean).join(" ");
      const daysSince = Math.floor((Date.now() - new Date(w.lastActivity).getTime()) / (1000 * 60 * 60 * 24));

      // Get optimal timing
      const timing = await analyzeFollowUpTiming(w.contactId, authCtx.tenantId);
      const timingHint = timing ? ` Best time: ${timing.bestDayOfWeek} ${timing.bestTimeWindow}` : "";

      recommendations.push({
        title: `Follow up with ${name}`,
        description: `${w.positiveCount} positive signal${Number(w.positiveCount) > 1 ? "s" : ""}, no reply in ${daysSince} days.${timingHint}`,
        urgency: daysSince > 10 ? 1 : 2,
        entityType: "contact",
        entityId: w.contactId,
        suggestedAction: "Send a short check-in referencing your last conversation",
      });
    }

    // 3. Upcoming meetings → prepare
    const upcomingMeetings = await db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyName: companies.name,
        summary: activities.summary,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .innerJoin(contacts, and(eq(activities.entityId, contacts.id), eq(activities.entityType, "contact"), isNull(contacts.deletedAt)))
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(
        eq(activities.tenantId, authCtx.tenantId),
        sql`${activities.activityType} IN ('meeting_scheduled')`,
        sql`${activities.occurredAt} > NOW()`,
        sql`${activities.occurredAt} < ${tomorrow.toISOString()}::timestamp`,
        isNull(activities.deletedAt),
      ))
      .limit(2);

    for (const m of upcomingMeetings) {
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
      recommendations.push({
        title: `Prepare for meeting with ${name}`,
        description: `"${m.summary}"${m.companyName ? ` at ${m.companyName}` : ""} — tomorrow`,
        urgency: 2,
        entityType: "contact",
        entityId: m.contactId,
        suggestedAction: "Review conversation history and prepare talking points",
      });
    }

    // 4. New warm matches
    const warmMatches = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        contactCount: sql<number>`count(DISTINCT ${contacts.id})`,
        emailCount: sql<number>`count(${activities.id})`,
      })
      .from(companies)
      .innerJoin(contacts, and(eq(contacts.companyId, companies.id), isNull(contacts.deletedAt)))
      .innerJoin(activities, and(eq(activities.entityId, contacts.id), eq(activities.entityType, "contact"), isNull(activities.deletedAt)))
      .where(and(
        eq(companies.tenantId, authCtx.tenantId),
        sql`${companies.properties}->>'source' = 'tam'`,
        sql`${contacts.properties}->>'source' = 'email_sync'`,
        isNull(companies.deletedAt),
      ))
      .groupBy(companies.id, companies.name)
      .orderBy(desc(sql`count(${activities.id})`))
      .limit(2);

    for (const w of warmMatches) {
      recommendations.push({
        title: `Warm match: ${w.companyName}`,
        description: `You've exchanged ${w.emailCount} emails with ${w.contactCount} contact${Number(w.contactCount) > 1 ? "s" : ""} there`,
        urgency: 3,
        entityType: "company",
        entityId: w.companyId,
        suggestedAction: "Review account and create a deal",
      });
    }

    // 5. Stalled deals
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
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
        isNull(deals.deletedAt),
      ))
      .limit(2);

    for (const d of stalledDeals) {
      recommendations.push({
        title: `${d.dealName} is stalling`,
        description: `${d.stage} stage, no activity in 14+ days${d.value ? `. $${d.value} at risk` : ""}`,
        urgency: 2,
        entityType: "deal",
        entityId: d.dealId,
        suggestedAction: "Reach out to the key contact with a new angle",
      });
    }

    // 5. Campaign recommendation — high-score accounts with no recent outreach
    // fourteenDaysAgo already declared above
    const highScoreAccounts = await db
      .select({
        id: companies.id,
        name: companies.name,
        score: companies.score,
        industry: companies.industry,
      })
      .from(companies)
      .where(and(
        eq(companies.tenantId, authCtx.tenantId),
        sql`${companies.score} >= 60`,
        isNull(companies.deletedAt),
      ))
      .orderBy(desc(companies.score))
      .limit(50);

    if (highScoreAccounts.length >= 3) {
      // Check which ones have no recent email activity
      const untouched: typeof highScoreAccounts = [];
      for (const acc of highScoreAccounts.slice(0, 20)) {
        const [recent] = await db
          .select({ count: sql<number>`count(*)` })
          .from(activities)
          .where(and(
            eq(activities.tenantId, authCtx.tenantId),
            eq(activities.entityType, "company"),
            eq(activities.entityId, acc.id),
            sql`${activities.activityType} IN ('email_sent', 'email_received')`,
            sql`${activities.occurredAt} >= now() - interval '14 days'`,
            isNull(activities.deletedAt),
          ));
        if (Number(recent?.count || 0) === 0) untouched.push(acc);
        if (untouched.length >= 5) break;
      }

      if (untouched.length >= 2) {
        const topIndustry = untouched[0]?.industry || "your ICP";
        recommendations.push({
          title: `Campaign: ${untouched.length} high-score accounts idle`,
          description: `${untouched.map(a => a.name).slice(0, 3).join(", ")} and ${Math.max(0, untouched.length - 3)} more haven't been contacted in 14+ days`,
          urgency: 3,
          entityType: "campaign",
          entityId: "new",
          suggestedAction: `Launch an outreach campaign targeting ${topIndustry} accounts`,
        });
      }
    }

    // Sort by urgency (1 = most urgent)
    recommendations.sort((a, b) => a.urgency - b.urgency);

    return NextResponse.json({ recommendations: recommendations.slice(0, 5) });
  } catch (error) {
    console.error("Recommendations generation failed:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
