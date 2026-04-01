import { auth } from "@/auth";
import { db } from "@/db";
import { companies, activities } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

// Calculated scoring — no LLM, pure data
function calculateFitScore(
  company: Record<string, unknown>,
  props: Record<string, unknown>,
  icp?: { industries?: string[]; sizeRange?: [number, number]; revenueRange?: [number, number]; technologies?: string[] }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Industry match (0-20)
  const industry = company.industry as string | null;
  if (industry) {
    const targetIndustries = icp?.industries || ["SaaS", "AI", "Software", "Technology", "Fintech", "Cloud"];
    if (targetIndustries.some((t) => industry.toLowerCase().includes(t.toLowerCase()))) {
      score += 20;
      reasons.push(`Industry match: ${industry}`);
    } else {
      score += 5;
    }
  }

  // Size in range (0-20)
  const employeeCount = props.employee_count as number | null;
  if (employeeCount) {
    const [minSize, maxSize] = icp?.sizeRange || [10, 500];
    if (employeeCount >= minSize && employeeCount <= maxSize) {
      score += 20;
      reasons.push(`Size in range: ${employeeCount} employees`);
    } else if (employeeCount >= minSize * 0.5 && employeeCount <= maxSize * 2) {
      score += 10;
    } else {
      score += 3;
    }
  }

  // Revenue in range (0-15)
  const annualRevenue = props.annual_revenue as number | null;
  if (annualRevenue) {
    const [minRev, maxRev] = icp?.revenueRange || [1_000_000, 100_000_000];
    if (annualRevenue >= minRev && annualRevenue <= maxRev) {
      score += 15;
      reasons.push(`Revenue in range: ${props.annual_revenue_printed || `$${(annualRevenue / 1_000_000).toFixed(0)}M`}`);
    } else if (annualRevenue >= minRev * 0.5) {
      score += 7;
    }
  }

  // Tech stack match (0-15)
  const technologies = (props.technologies as string[]) || [];
  if (technologies.length > 0) {
    const targetTech = icp?.technologies || ["React", "Node.js", "AWS", "Salesforce", "HubSpot", "Stripe", "PostgreSQL"];
    const matches = technologies.filter((t) =>
      targetTech.some((tt) => t.toLowerCase().includes(tt.toLowerCase()))
    );
    if (matches.length >= 3) {
      score += 15;
      reasons.push(`Tech stack match: ${matches.slice(0, 3).join(", ")}`);
    } else if (matches.length >= 1) {
      score += 8;
      reasons.push(`Some tech overlap: ${matches.join(", ")}`);
    }
  }

  // Recent funding (0-10)
  const totalFunding = props.total_funding as number | null;
  const fundingStage = props.latest_funding_stage as string | null;
  if (totalFunding && totalFunding > 0) {
    score += 10;
    reasons.push(`Funded: ${props.total_funding_printed || `$${(totalFunding / 1_000_000).toFixed(0)}M`} (${fundingStage || "undisclosed"})`);
  }

  // LinkedIn presence (proxy for senior contacts available) (0-10)
  const linkedinUrl = props.linkedin_url as string | null;
  if (linkedinUrl) {
    score += 5;
  }
  // Apollo enrichment available = better data
  if (props.enrichment_source === "apollo") {
    score += 5;
    reasons.push("Verified by Apollo.io enrichment");
  }

  // Location (0-10) — US/Europe preferred
  const country = props.country as string | null;
  if (country) {
    const preferredCountries = ["United States", "Canada", "United Kingdom", "Germany", "France", "Netherlands", "Australia"];
    if (preferredCountries.some((c) => country.includes(c))) {
      score += 10;
    } else {
      score += 3;
    }
  }

  return { score: Math.min(100, score), reasons };
}

async function calculateEngagementScore(
  tenantId: string,
  companyId: string
): Promise<{ score: number; reasons: string[] }> {
  let score = 0;
  const reasons: string[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Count email activities in last 30 days
  const [emailCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        gte(activities.occurredAt, thirtyDaysAgo)
      )
    );

  const emails = Number(emailCount?.count || 0);
  if (emails > 10) { score += 25; reasons.push(`${emails} interactions in last 30 days`); }
  else if (emails > 5) { score += 15; }
  else if (emails > 0) { score += 8; }

  // Meeting activities
  const [meetingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        sql`activity_type IN ('meeting_scheduled', 'meeting_completed')`,
        gte(activities.occurredAt, thirtyDaysAgo)
      )
    );

  const meetings = Number(meetingCount?.count || 0);
  if (meetings > 0) {
    score += Math.min(25, meetings * 12);
    reasons.push(`${meetings} meeting(s) in last 30 days`);
  }

  // Recency of last contact
  const [lastActivity] = await db
    .select({ latest: sql<string>`max(occurred_at)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId)
      )
    );

  if (lastActivity?.latest) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastActivity.latest).getTime()) / 86400000
    );
    if (daysSince <= 3) { score += 20; reasons.push(`Last contact: ${daysSince} days ago`); }
    else if (daysSince <= 7) { score += 15; }
    else if (daysSince <= 14) { score += 10; }
    else if (daysSince <= 30) { score += 5; }
  }

  // Positive replies
  const [positiveCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        eq(activities.sentiment, "positive")
      )
    );

  const positives = Number(positiveCount?.count || 0);
  if (positives > 0) {
    score += Math.min(15, positives * 8);
    reasons.push(`${positives} positive interaction(s)`);
  }

  // Multi-thread (multiple contacts at same company)
  const [threadCount] = await db
    .select({ count: sql<number>`count(DISTINCT actor_id)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        eq(activities.actorType, "contact")
      )
    );

  const threads = Number(threadCount?.count || 0);
  if (threads > 1) {
    score += Math.min(15, threads * 5);
    reasons.push(`Multi-threaded: ${threads} contacts engaged`);
  }

  return { score: Math.min(100, score), reasons };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyIds } = body;

    if (!companyIds || !Array.isArray(companyIds)) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    let scored = 0;

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, id))
          .limit(1);

        if (!company) continue;

        const props = (company.properties || {}) as Record<string, unknown>;

        // Calculate Fit score (from Apollo data)
        const fit = calculateFitScore(company, props);

        // Calculate Engagement score (from activities)
        const engagement = await calculateEngagementScore("default", id);

        // Combined score: Fit × 0.5 + Engagement × 0.5
        const totalScore = Math.round(fit.score * 0.5 + engagement.score * 0.5);
        const allReasons = [...fit.reasons, ...engagement.reasons];

        // Determine grade
        let grade: string;
        if (totalScore >= 80) grade = "A";
        else if (totalScore >= 60) grade = "B";
        else if (totalScore >= 40) grade = "C";
        else if (totalScore >= 20) grade = "D";
        else grade = "F";

        await db
          .update(companies)
          .set({
            score: totalScore,
            scoreReasons: allReasons,
            properties: {
              ...props,
              score_grade: grade,
              score_fit: fit.score,
              score_engagement: engagement.score,
              score_fit_reasons: fit.reasons,
              score_engagement_reasons: engagement.reasons,
              scored_at: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(companies.id, id));

        scored++;
      } catch (err) {
        console.warn(`Failed to score company ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Scoring failed:", error);
    return Response.json({ error: "Scoring failed" }, { status: 500 });
  }
}
