import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import type { SkillRunOptions } from "@/skills/types";
import type { PipelineReviewInput, PipelineReviewOutput } from "./schema";

export async function pipelineReviewHandler(
  input: PipelineReviewInput,
  options: SkillRunOptions,
): Promise<PipelineReviewOutput> {
  const periodStart = new Date(Date.now() - input.periodDays * 24 * 60 * 60 * 1000);

  // Fetch all active deals
  const allDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.tenantId, options.tenantId));

  // Fetch companies and contacts for context
  const companyIds = [...new Set(allDeals.map((d) => d.companyId).filter(Boolean))] as string[];
  const contactIds = [...new Set(allDeals.map((d) => d.contactId).filter(Boolean))] as string[];

  const companyRows = companyIds.length > 0
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(sql`${companies.id} IN ${companyIds}`)
    : [];
  const contactRows = contactIds.length > 0
    ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(sql`${contacts.id} IN ${contactIds}`)
    : [];

  const companyMap = new Map(companyRows.map((c) => [c.id, c.name]));
  const contactMap = new Map(contactRows.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ")]));

  // Build deal summaries
  const dealSummaries = allDeals.map((deal) => {
    const updatedAt = deal.updatedAt ? new Date(deal.updatedAt) : new Date(deal.createdAt!);
    const daysInStage = Math.round((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    const isStuck = daysInStage >= input.stuckThresholdDays && !["won", "lost"].includes(deal.stage);

    return {
      dealId: deal.id,
      name: deal.name,
      stage: deal.stage,
      value: deal.value ? Number(deal.value) : null,
      companyName: deal.companyId ? companyMap.get(deal.companyId) ?? null : null,
      contactName: deal.contactId ? contactMap.get(deal.contactId) ?? null : null,
      daysInStage,
      isStuck,
      lastActivityDaysAgo: daysInStage,
      createdAt: deal.createdAt,
    };
  });

  // Stage breakdown
  const stageMap = new Map<string, { count: number; totalValue: number }>();
  for (const deal of dealSummaries) {
    const entry = stageMap.get(deal.stage) ?? { count: 0, totalValue: 0 };
    entry.count++;
    entry.totalValue += deal.value ?? 0;
    stageMap.set(deal.stage, entry);
  }

  const stageBreakdown = Array.from(stageMap.entries()).map(([stage, data]) => ({
    stage,
    ...data,
  }));

  // Metrics
  const activeDeals = dealSummaries.filter((d) => !["won", "lost"].includes(d.stage));
  const wonDeals = dealSummaries.filter((d) => d.stage === "won");
  const lostDeals = dealSummaries.filter((d) => d.stage === "lost");
  const closedDeals = [...wonDeals, ...lostDeals];

  const createdInPeriod = dealSummaries.filter(
    (d) => d.createdAt && new Date(d.createdAt) >= periodStart,
  ).length;

  const closedInPeriod = closedDeals.filter(
    (d) => d.createdAt && new Date(d.createdAt) >= periodStart,
  ).length;

  const totalValue = activeDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const avgDealValue = activeDeals.length > 0 ? Math.round(totalValue / activeDeals.length) : 0;
  const avgDaysInPipeline = activeDeals.length > 0
    ? Math.round(activeDeals.reduce((sum, d) => sum + d.daysInStage, 0) / activeDeals.length)
    : 0;
  const winRate = closedDeals.length > 0
    ? Math.round((wonDeals.length / closedDeals.length) * 100)
    : null;

  // Stuck deals
  const stuckDeals = dealSummaries
    .filter((d) => d.isStuck)
    .sort((a, b) => b.daysInStage - a.daysInStage)
    .map(({ createdAt, ...rest }) => rest);

  // Top deals by value
  const topDeals = activeDeals
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 10)
    .map(({ createdAt, ...rest }) => rest);

  return {
    period: `${input.periodDays} days`,
    totalDeals: activeDeals.length,
    totalValue,
    stageBreakdown,
    stuckDeals,
    topDeals,
    metrics: {
      avgDaysInPipeline,
      winRate,
      avgDealValue,
      dealsCreatedInPeriod: createdInPeriod,
      dealsClosedInPeriod: closedInPeriod,
    },
  };
}
