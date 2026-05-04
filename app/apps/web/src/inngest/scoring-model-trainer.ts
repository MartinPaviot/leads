/**
 * Inngest cron: train predictive deal scoring model weekly.
 *
 * For each tenant with closed deals, this function:
 * 1. Queries all won/lost deals from the last 12 months
 * 2. Extracts features from each deal + its activities + company
 * 3. Trains a Naive Bayes model using trainScoringModel()
 * 4. Stores the model in tenant settings (tenants.settings.scoringModel)
 *
 * The model is small (~2-5 KB of JSON) and runs inference in <1ms,
 * so storing it in settings is fine. No LLM calls involved — this
 * is pure statistical computation.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants, deals, companies, activities, contacts } from "@/db/schema";
import { eq, and, or, gte, sql, inArray } from "drizzle-orm";
import {
  trainScoringModel,
  valueToBucket,
  type ClosedDealData,
  type DealFeatures,
  type ScoringModel,
} from "@/lib/scoring/predictive-scorer";
import {
  trainCompanyModel,
  type CompanyTrainingRow,
} from "@/lib/scoring/company-model-trainer";

/**
 * Weekly cron: retrain predictive scoring models for all tenants.
 * Runs every Monday at 3 AM UTC.
 */
export const weeklyModelTraining = inngest.createFunction(
  {
    id: "weekly-scoring-model-training",
    name: "Weekly Predictive Scoring Model Training",
    retries: 1,
    triggers: [{ cron: "0 3 * * 1" }], // Monday 3 AM UTC
  },
  async ({ step }) => {
    // Find all tenants that have at least one closed deal
    const tenantsWithDeals = await step.run("find-tenants", async () => {
      const rows = await db
        .select({ tenantId: deals.tenantId })
        .from(deals)
        .where(
          or(eq(deals.stage, "won"), eq(deals.stage, "lost")),
        )
        .groupBy(deals.tenantId);

      return rows.map((r) => r.tenantId);
    });

    let trained = 0;
    let skipped = 0;

    for (const tenantId of tenantsWithDeals) {
      const result = await step.run(`train-${tenantId}`, async () => {
        return trainModelForTenant(tenantId);
      });

      if (result === "trained") trained++;
      else skipped++;
    }

    return { tenantsProcessed: tenantsWithDeals.length, trained, skipped };
  },
);

/**
 * On-demand training trigger. Can be fired from the admin panel
 * or after a deal is closed to refresh the model immediately.
 */
export const trainScoringModelOnDemand = inngest.createFunction(
  {
    id: "train-scoring-model-on-demand",
    name: "Train Predictive Scoring Model (on-demand)",
    retries: 1,
    concurrency: [{ limit: 1, key: "event.data.tenantId" }],
    triggers: [{ event: "scoring/train-model-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId } = event.data as { tenantId: string };

    const result = await step.run("train", async () => {
      return trainModelForTenant(tenantId);
    });

    return { tenantId, result };
  },
);

// ── Core training logic ──────────────────────────────────────

async function trainModelForTenant(
  tenantId: string,
): Promise<"trained" | "insufficient_data" | "error"> {
  try {
    // 1. Query closed deals from last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const closedDeals = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          or(eq(deals.stage, "won"), eq(deals.stage, "lost")),
          gte(deals.updatedAt, twelveMonthsAgo),
        ),
      );

    if (closedDeals.length < 5) {
      return "insufficient_data";
    }

    // 2. Build feature vectors for each deal
    const closedDealData: ClosedDealData[] = [];

    for (const deal of closedDeals) {
      const features = await extractDealFeatures(tenantId, deal);
      closedDealData.push({
        outcome: deal.stage as "won" | "lost",
        features,
      });
    }

    // 3. Train the model
    const model = trainScoringModel(closedDealData);

    // 3b. Train company-level model from closed-deal companies
    const companyRows: CompanyTrainingRow[] = [];
    for (const deal of closedDeals) {
      if (!deal.companyId) continue;
      const [company] = await db
        .select({
          industry: companies.industry,
          size: companies.size,
          properties: companies.properties,
        })
        .from(companies)
        .where(eq(companies.id, deal.companyId))
        .limit(1);
      if (!company) continue;

      const cProps = (company.properties || {}) as Record<string, unknown>;
      companyRows.push({
        outcome: deal.stage as "won" | "lost",
        industry: company.industry || "unknown",
        companySize: company.size || "unknown",
        country: (cProps.country as string) || "unknown",
        fundingStage: (cProps.latest_funding_stage as string) || "none",
        hasRecentFunding: Boolean(cProps.latest_funding_raised_at),
        techStackOverlap: Array.isArray(cProps.technologies) ? (cProps.technologies as string[]).length : 0,
      });
    }
    const companyModel = trainCompanyModel(companyRows);

    // 4. Persist to tenant settings
    const [tenant] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const currentSettings = (tenant?.settings || {}) as Record<string, unknown>;

    await db
      .update(tenants)
      .set({
        settings: {
          ...currentSettings,
          scoringModel: model,
          ...(companyModel ? { companyModel } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    return "trained";
  } catch (err) {
    console.error(`Scoring model training failed for tenant ${tenantId}:`, err);
    return "error";
  }
}

// ── Feature extraction from DB ───────────────────────────────

async function extractDealFeatures(
  tenantId: string,
  deal: typeof deals.$inferSelect,
): Promise<DealFeatures> {
  // Get company info for industry/size
  let industry = "unknown";
  let companySize = "unknown";

  if (deal.companyId) {
    const [company] = await db
      .select({
        industry: companies.industry,
        size: companies.size,
        properties: companies.properties,
      })
      .from(companies)
      .where(eq(companies.id, deal.companyId))
      .limit(1);

    if (company) {
      industry = company.industry || "unknown";
      companySize = company.size || "unknown";
      // Try to get more precise size from properties
      const props = (company.properties || {}) as Record<string, unknown>;
      if (props.employee_count && typeof props.employee_count === "number") {
        const count = props.employee_count as number;
        if (count <= 10) companySize = "1-10";
        else if (count <= 50) companySize = "11-50";
        else if (count <= 200) companySize = "51-200";
        else if (count <= 1000) companySize = "201-1000";
        else companySize = "1000+";
      }
    }
  }

  // Count activities for this deal
  const dealActivities = await db
    .select({
      activityType: activities.activityType,
      sentiment: activities.sentiment,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "deal"),
        eq(activities.entityId, deal.id),
      ),
    );

  // Also count activities linked via the deal's contact
  const contactActivities = deal.contactId
    ? await db
        .select({
          activityType: activities.activityType,
          sentiment: activities.sentiment,
          metadata: activities.metadata,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, tenantId),
            eq(activities.entityType, "contact"),
            eq(activities.entityId, deal.contactId),
          ),
        )
    : [];

  const allActivities = [...dealActivities, ...contactActivities];

  const meetingCount = allActivities.filter(
    (a) => a.activityType === "meeting_completed" || a.activityType === "meeting_scheduled",
  ).length;

  // Determine dominant email sentiment
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const a of allActivities) {
    if (a.sentiment && a.sentiment in sentimentCounts) {
      sentimentCounts[a.sentiment as keyof typeof sentimentCounts]++;
    }
  }
  const emailSentiment: "positive" | "neutral" | "negative" =
    sentimentCounts.positive > sentimentCounts.negative
      ? "positive"
      : sentimentCounts.negative > sentimentCounts.positive
        ? "negative"
        : "neutral";

  // Check for champion signals in metadata
  const hasChampion = allActivities.some((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    const extraction = meta.llmExtraction as Record<string, unknown> | undefined;
    if (extraction && Array.isArray(extraction.championSignals)) {
      return extraction.championSignals.length > 0;
    }
    return false;
  });

  // Check for competitor mentions
  const hasCompetitor = allActivities.some((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    const extraction = meta.llmExtraction as Record<string, unknown> | undefined;
    if (extraction && Array.isArray(extraction.competitorsMentioned)) {
      return extraction.competitorsMentioned.length > 0;
    }
    return false;
  });

  // Count unique contacts engaged (from email activities)
  const contactEmails = new Set<string>();
  for (const a of allActivities) {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    if (meta.from) contactEmails.add(String(meta.from));
    if (Array.isArray(meta.to)) {
      for (const to of meta.to) contactEmails.add(String(to));
    }
  }

  // Stage velocity: days from creation to close
  const createdAt = deal.createdAt ? new Date(deal.createdAt).getTime() : Date.now();
  const closedAt = deal.updatedAt ? new Date(deal.updatedAt).getTime() : Date.now();
  const stageVelocityDays = Math.max(1, Math.round((closedAt - createdAt) / (24 * 60 * 60 * 1000)));

  return {
    industry,
    companySize,
    valueBucket: valueToBucket(deal.value),
    stageVelocityDays,
    contactsEngaged: contactEmails.size,
    meetingCount,
    emailSentiment,
    hasChampion,
    hasCompetitor,
  };
}

/**
 * Re-exported for use by the deal detail API endpoint.
 * Extracts features for a single live deal so it can be scored.
 */
export { extractDealFeatures };
