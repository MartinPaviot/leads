import { db } from "@/db";
import { companies, contacts, deals, activities } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { SkillRunOptions } from "@/skills/types";
import type { ExpansionSignalSpotterInput, ExpansionSignalSpotterOutput } from "./schema";

type Signal = ExpansionSignalSpotterOutput["signals"][number];

export async function expansionSignalSpotterHandler(
  input: ExpansionSignalSpotterInput,
  options: SkillRunOptions,
): Promise<ExpansionSignalSpotterOutput> {
  const lookbackDate = new Date(Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000);
  const signals: Signal[] = [];

  // Get companies with won deals (customers)
  const wonDeals = await db
    .select()
    .from(deals)
    .where(and(
      eq(deals.tenantId, options.tenantId),
      eq(deals.stage, "won"),
    ));

  const customerCompanyIds = [...new Set(wonDeals.map((d) => d.companyId).filter(Boolean))] as string[];

  if (customerCompanyIds.length === 0) {
    return {
      totalCustomersAnalyzed: 0,
      expansionOpportunities: 0,
      totalExpansionRevenue: 0,
      signals: [],
    };
  }

  const customerCompanies = await db
    .select()
    .from(companies)
    .where(and(
      eq(companies.tenantId, options.tenantId),
      sql`${companies.id} IN ${customerCompanyIds}`,
    ));

  for (const company of customerCompanies) {
    const companyDeals = wonDeals.filter((d) => d.companyId === company.id);
    const totalDealValue = companyDeals.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0);

    // Check for new contacts added recently (new department engagement)
    const [newContactCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, options.tenantId),
        eq(contacts.companyId, company.id),
        gte(contacts.createdAt, lookbackDate),
      ));

    if (Number(newContactCount?.count || 0) >= 3) {
      signals.push({
        companyId: company.id,
        companyName: company.name,
        signalType: "new_department",
        title: "New contacts from multiple departments",
        description: `${newContactCount?.count} new contacts added in last ${input.lookbackDays} days — expanding engagement beyond initial champion`,
        strength: Number(newContactCount?.count || 0) >= 5 ? "high" : "medium",
        suggestedAction: "Schedule an expansion review meeting — map new stakeholders to additional use cases",
        currentDealValue: totalDealValue,
      });
    }

    // Check for positive sentiment trend
    const [posCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        eq(activities.sentiment, "positive"),
        gte(activities.occurredAt, lookbackDate),
      ));

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        gte(activities.occurredAt, lookbackDate),
      ));

    const positives = Number(posCount?.count || 0);
    const total = Number(totalCount?.count || 0);

    if (total >= 5 && positives / total >= 0.7) {
      signals.push({
        companyId: company.id,
        companyName: company.name,
        signalType: "positive_sentiment",
        title: "Consistently positive engagement",
        description: `${Math.round((positives / total) * 100)}% positive sentiment across ${total} interactions — happy customer, ripe for expansion`,
        strength: positives / total >= 0.85 ? "high" : "medium",
        suggestedAction: "Ask for a case study or referral, then pitch expansion — momentum is in your favor",
        currentDealValue: totalDealValue,
      });
    }

    // Check for increasing activity volume
    const midpoint = new Date(Date.now() - (input.lookbackDays / 2) * 24 * 60 * 60 * 1000);

    const [recentAct] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        gte(activities.occurredAt, midpoint),
      ));

    const [olderAct] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(
        eq(activities.tenantId, options.tenantId),
        eq(activities.entityId, company.id),
        eq(activities.entityType, "company"),
        gte(activities.occurredAt, lookbackDate),
        sql`${activities.occurredAt} < ${midpoint.toISOString()}::timestamptz`,
      ));

    const recent = Number(recentAct?.count || 0);
    const older = Number(olderAct?.count || 0);

    if (recent > 0 && older > 0 && recent >= older * 1.5) {
      signals.push({
        companyId: company.id,
        companyName: company.name,
        signalType: "usage_increase",
        title: "Activity volume increasing",
        description: `Engagement up ${Math.round((recent / older - 1) * 100)}%: ${recent} recent vs ${older} prior period`,
        strength: recent >= older * 2 ? "high" : "medium",
        suggestedAction: "They're getting more value — propose an expansion call to discuss scaling",
        currentDealValue: totalDealValue,
      });
    }

    // Check company headcount growth
    const props = (company.properties as Record<string, unknown>) ?? {};
    const lastKnown = props.lastKnownEmployeeCount as number | null;
    const current = company.size ? parseInt(company.size) : null;

    if (lastKnown && current && current > lastKnown * 1.2) {
      signals.push({
        companyId: company.id,
        companyName: company.name,
        signalType: "headcount_growth",
        title: "Company growing rapidly",
        description: `Headcount grew from ${lastKnown} to ${current} — ${Math.round((current / lastKnown - 1) * 100)}% growth means more seats/users needed`,
        strength: current > lastKnown * 1.5 ? "high" : "medium",
        suggestedAction: "Propose scaling plan — more employees = more licenses/seats",
        currentDealValue: totalDealValue,
      });
    }
  }

  const strengthOrder = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]);

  const totalExpansionRevenue = signals
    .filter((s) => s.strength !== "low")
    .reduce((sum, s) => sum + (s.currentDealValue ?? 0), 0);

  return {
    totalCustomersAnalyzed: customerCompanies.length,
    expansionOpportunities: signals.length,
    totalExpansionRevenue,
    signals,
  };
}
