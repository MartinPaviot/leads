import { db } from "@/db";
import { activities, contacts, companies } from "@/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";

export interface ContactScoreResult {
  score: number;
  reasons: string[];
  breakdown: {
    seniority: number;
    engagement: number;
    sentiment: number;
    icpFit: number;
  };
}

const SENIORITY_SCORES: Record<string, number> = {
  "owner": 25, "founder": 25, "co-founder": 25,
  "c-suite": 25, "ceo": 25, "cto": 25, "cfo": 25, "coo": 25, "cmo": 25, "cio": 25, "cro": 25, "cpo": 25,
  "partner": 22, "managing partner": 22,
  "vp": 20, "vice president": 20,
  "head": 18,
  "director": 15,
  "manager": 10,
  "senior": 5,
  "lead": 5,
};

function scoreSeniority(title: string | null, seniority: string | null): { score: number; reason: string } {
  const text = (title || seniority || "").toLowerCase();

  for (const [keyword, score] of Object.entries(SENIORITY_SCORES)) {
    if (text.includes(keyword)) {
      return { score, reason: `Seniority: ${keyword} (${score}/25)` };
    }
  }

  return { score: 0, reason: "Seniority: unknown role (0/25)" };
}

export async function scoreContact(
  contactId: string,
  tenantId: string,
  icpSettings?: { targetRoles?: string; targetIndustries?: string[] }
): Promise<ContactScoreResult> {
  const reasons: string[] = [];

  // Fetch contact (scoped to tenant)
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
    .limit(1);

  if (!contact) {
    return {
      score: 0,
      reasons: ["Contact not found"],
      breakdown: { seniority: 0, engagement: 0, sentiment: 0, icpFit: 0 },
    };
  }

  // 1. Seniority (0-25)
  const props = (contact.properties || {}) as Record<string, unknown>;
  const seniorityResult = scoreSeniority(contact.title, props.seniority as string | null);
  reasons.push(seniorityResult.reason);

  // 2. Engagement (0-35)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [emailCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      sql`${activities.activityType} IN ('email_received', 'email_sent')`,
      gte(activities.occurredAt, thirtyDaysAgo),
    ));

  const [meetingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      sql`${activities.activityType} IN ('meeting_scheduled', 'meeting_completed')`,
      gte(activities.occurredAt, thirtyDaysAgo),
    ));

  const [lastActivity] = await db
    .select({ latest: sql<string>`max(${activities.occurredAt})` })
    .from(activities)
    .where(and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
    ));

  const emails = Number(emailCount?.count || 0);
  const meetings = Number(meetingCount?.count || 0);

  let emailScore = 0;
  if (emails > 10) emailScore = 15;
  else if (emails > 5) emailScore = 10;
  else if (emails > 0) emailScore = 5;

  const meetingScore = Math.min(10, meetings * 5);

  let recencyScore = 0;
  if (lastActivity?.latest) {
    const daysSince = (Date.now() - new Date(lastActivity.latest).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 3) recencyScore = 10;
    else if (daysSince <= 7) recencyScore = 7;
    else if (daysSince <= 14) recencyScore = 4;
    else if (daysSince <= 30) recencyScore = 2;
  }

  const engagementScore = emailScore + meetingScore + recencyScore;
  reasons.push(`Engagement: ${emails} emails, ${meetings} meetings, recency ${recencyScore}/10 (${engagementScore}/35)`);

  // 3. Sentiment (0-25)
  const [positiveCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      eq(activities.sentiment, "positive"),
    ));

  const [totalWithSentiment] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      sql`${activities.sentiment} IS NOT NULL`,
    ));

  const positives = Number(positiveCount?.count || 0);
  const totalSentiment = Number(totalWithSentiment?.count || 0);
  const sentimentScore = totalSentiment > 0 ? Math.round((positives / totalSentiment) * 25) : 0;
  reasons.push(`Sentiment: ${positives}/${totalSentiment} positive (${sentimentScore}/25)`);

  // 4. ICP Fit (0-15)
  let icpScore = 0;

  // Is contact's company a TAM company? +10
  if (contact.companyId) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
      .limit(1);

    if (company) {
      const companyProps = (company.properties || {}) as Record<string, unknown>;
      if (companyProps.source === "tam") {
        icpScore += 10;
        reasons.push("ICP: Company is in TAM (+10)");
      }
    }
  }

  // Does contact's title match targetRoles? +5
  if (icpSettings?.targetRoles && contact.title) {
    const roles = icpSettings.targetRoles.toLowerCase().split(/,\s*/);
    const contactTitle = contact.title.toLowerCase();
    if (roles.some((r) => contactTitle.includes(r))) {
      icpScore += 5;
      reasons.push("ICP: Title matches target roles (+5)");
    }
  }

  // Does company industry match targetIndustries? (part of the TAM 10 if already scored, otherwise +5 standalone)
  if (icpSettings?.targetIndustries?.length && contact.companyId && icpScore < 15) {
    const [company] = icpScore >= 10
      ? [] // already fetched above for TAM check
      : await db
          .select({ industry: companies.industry })
          .from(companies)
          .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
          .limit(1);
    const industry = company?.industry?.toLowerCase() ?? "";
    if (industry && icpSettings.targetIndustries.some((t) => industry.includes(t.toLowerCase()))) {
      icpScore = Math.min(15, icpScore + 5);
      reasons.push("ICP: Industry matches target (+5)");
    }
  }

  if (icpScore === 0) reasons.push("ICP: No match (0/15)");

  const totalScore = Math.min(100, seniorityResult.score + engagementScore + sentimentScore + icpScore);

  return {
    score: totalScore,
    reasons,
    breakdown: {
      seniority: seniorityResult.score,
      engagement: engagementScore,
      sentiment: sentimentScore,
      icpFit: icpScore,
    },
  };
}
