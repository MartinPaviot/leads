import { db } from "@/db";
import { companies, activities, deals } from "@/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { getDeepConversationContext } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { ChurnRiskDetectorInput, ChurnRiskDetectorOutput } from "./schema";

type AtRiskAccount = ChurnRiskDetectorOutput["atRiskAccounts"][number];

export async function churnRiskDetectorHandler(
  input: ChurnRiskDetectorInput,
  options: SkillRunOptions,
): Promise<ChurnRiskDetectorOutput> {
  const lookbackDate = new Date(Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch all companies for tenant
  const companyRecords = await db
    .select()
    .from(companies)
    .where(eq(companies.tenantId, options.tenantId));

  const atRiskAccounts: AtRiskAccount[] = [];

  for (const company of companyRecords) {
    const riskReasons: string[] = [];

    // Get last activity
    const [lastAct] = await db
      .select({ latest: sql<string>`max(${activities.occurredAt})` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
      ));

    const lastActivityDate = lastAct?.latest ? new Date(lastAct.latest) : null;
    const daysSinceLastActivity = lastActivityDate
      ? Math.round((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Get activity count in period
    const [actCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        gte(activities.occurredAt, lookbackDate),
      ));
    const totalActivitiesInPeriod = Number(actCount?.count || 0);

    // Get negative sentiment count
    const [negCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        eq(activities.sentiment, "negative"),
        gte(activities.occurredAt, lookbackDate),
      ));
    const negativeSentimentCount = Number(negCount?.count || 0);

    // Get active deals
    const activeDeals = await db
      .select()
      .from(deals)
      .where(and(
        eq(deals.tenantId, options.tenantId),
        eq(deals.companyId, company.id),
        sql`${deals.stage} NOT IN ('won', 'lost')`,
      ));

    const activeDealCount = activeDeals.length;
    const totalDealValue = activeDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);

    // Determine risk level
    let riskLevel: "critical" | "high" | "medium" | null = null;

    if (daysSinceLastActivity >= input.inactivityThresholdDays * 2) {
      riskLevel = "critical";
      riskReasons.push(`No activity for ${daysSinceLastActivity} days`);
    } else if (daysSinceLastActivity >= input.inactivityThresholdDays) {
      riskLevel = "high";
      riskReasons.push(`Inactive for ${daysSinceLastActivity} days`);
    }

    if (negativeSentimentCount >= 3) {
      riskLevel = riskLevel === "critical" ? "critical" : "high";
      riskReasons.push(`${negativeSentimentCount} negative interactions`);
    } else if (negativeSentimentCount >= 1) {
      if (!riskLevel) riskLevel = "medium";
      riskReasons.push(`${negativeSentimentCount} negative interaction(s)`);
    }

    // Engagement drop
    if (totalActivitiesInPeriod === 0 && activeDealCount > 0) {
      riskLevel = riskLevel || "high";
      riskReasons.push(`Zero activity but ${activeDealCount} active deal(s)`);
    }

    if (!riskLevel) continue; // Not at risk

    // Enrich at-risk accounts with deep conversation context — limit to top 10
    // to avoid N+1 query explosion on large tenants.
    const shouldEnrich = atRiskAccounts.length < 10;
    const conversation = shouldEnrich
      ? await getDeepConversationContext(options.tenantId, {
          companyId: company.id,
          query: "churn risk indicators dissatisfaction",
        })
      : { activities: "", notes: "", semanticResults: "" };

    // Build a context-aware suggested action
    let suggestedAction = "Schedule a check-in call";
    const hasNotes = conversation.notes.length > 0;
    const hasSemanticContext = conversation.semanticResults.length > 0;
    const contextSuffix = hasNotes || hasSemanticContext
      ? ` | Context: ${conversation.notes.slice(0, 150) || conversation.semanticResults.slice(0, 150)}`
      : "";

    if (riskLevel === "critical") {
      suggestedAction = totalDealValue > 10000
        ? `Executive escalation needed — high-value account going dark${contextSuffix}`
        : `Send a personal re-engagement email from the founder${contextSuffix}`;
    } else if (riskLevel === "high") {
      suggestedAction = negativeSentimentCount > 0
        ? `Address negative feedback directly — schedule a resolution call${contextSuffix}`
        : `Send value-add content and schedule a check-in${contextSuffix}`;
    } else {
      suggestedAction += contextSuffix;
    }

    // Append deep-context risk reasons if relevant content found
    if (conversation.notes) {
      riskReasons.push(`Notes mention: ${conversation.notes.slice(0, 100)}`);
    }
    if (conversation.semanticResults) {
      riskReasons.push(`Related signals: ${conversation.semanticResults.slice(0, 100)}`);
    }

    atRiskAccounts.push({
      companyId: company.id,
      companyName: company.name,
      riskLevel,
      daysSinceLastActivity,
      totalActivitiesInPeriod,
      activeDealCount,
      totalDealValue,
      negativeSentimentCount,
      riskReasons,
      suggestedAction,
    });
  }

  // Sort by risk level
  const riskOrder = { critical: 0, high: 1, medium: 2 };
  atRiskAccounts.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  return {
    period: `${input.lookbackDays} days`,
    totalAccountsAnalyzed: companyRecords.length,
    atRiskAccounts,
    summary: {
      critical: atRiskAccounts.filter((a) => a.riskLevel === "critical").length,
      high: atRiskAccounts.filter((a) => a.riskLevel === "high").length,
      medium: atRiskAccounts.filter((a) => a.riskLevel === "medium").length,
      totalAtRiskValue: atRiskAccounts.reduce((s, a) => s + a.totalDealValue, 0),
    },
  };
}
