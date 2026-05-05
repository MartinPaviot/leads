/**
 * GET /api/deals/[id]/score — Predictive win probability for a deal.
 *
 * Uses the Naive Bayes model trained weekly and stored in tenant settings.
 * Returns the probability (0-1) and top contributing factors.
 *
 * Falls back gracefully:
 * - No model trained yet → returns stage-based probability
 * - Deal has no company → uses "unknown" for industry/size features
 * - No activities → scores with minimal engagement features
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, tenants, companies, activities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  scoreDeal,
  valueToBucket,
  type DealFeatures,
  type ScoringModel,
} from "@/lib/scoring/predictive-scorer";
import { stageProbability } from "@/lib/deals/deal-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Load the deal
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    // Load the scoring model from tenant settings
    const [tenant] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1);

    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const model = settings.scoringModel as ScoringModel | undefined;

    // If no model, return stage-based fallback
    if (!model || !model.featureWeights) {
      const fallbackProb = stageProbability(deal.stage) ?? 50;
      return Response.json({
        probability: fallbackProb / 100,
        topFactors: ["No predictive model trained yet (using stage-based estimate)"],
        modelSource: "stage_fallback",
        trainedAt: null,
        sampleSize: 0,
      });
    }

    // Extract live features for this deal
    const features = await extractLiveDealFeatures(authCtx.tenantId, deal);

    // Score the deal
    const result = scoreDeal(features, model);

    return Response.json({
      probability: result.probability,
      topFactors: result.topFactors,
      modelSource: "naive_bayes",
      trainedAt: model.trainedAt,
      sampleSize: model.sampleSize,
      features, // Include for transparency
    });
  } catch (error) {
    console.error("Failed to score deal:", error);
    return Response.json({ error: "Failed to score deal" }, { status: 500 });
  }
}

/**
 * Extract features for a live (non-closed) deal. Mirrors the logic
 * in scoring-model-trainer.ts but operates on a single deal.
 */
async function extractLiveDealFeatures(
  tenantId: string,
  deal: typeof deals.$inferSelect,
): Promise<DealFeatures> {
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

  // Count activities for this deal + its contact
  const entityFilters = [
    and(
      eq(activities.tenantId, tenantId),
      eq(activities.entityType, "deal"),
      eq(activities.entityId, deal.id),
    ),
  ];

  if (deal.contactId) {
    entityFilters.push(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, deal.contactId),
      ),
    );
  }

  const allActivities = [];
  for (const filter of entityFilters) {
    const rows = await db
      .select({
        activityType: activities.activityType,
        sentiment: activities.sentiment,
        metadata: activities.metadata,
      })
      .from(activities)
      .where(filter!);
    allActivities.push(...rows);
  }

  const meetingCount = allActivities.filter(
    (a) =>
      a.activityType === "meeting_completed" ||
      a.activityType === "meeting_scheduled",
  ).length;

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

  const hasChampion = allActivities.some((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    const extraction = meta.llmExtraction as Record<string, unknown> | undefined;
    return extraction && Array.isArray(extraction.championSignals) && extraction.championSignals.length > 0;
  });

  const hasCompetitor = allActivities.some((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    const extraction = meta.llmExtraction as Record<string, unknown> | undefined;
    return extraction && Array.isArray(extraction.competitorsMentioned) && extraction.competitorsMentioned.length > 0;
  });

  const contactEmails = new Set<string>();
  for (const a of allActivities) {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    if (meta.from) contactEmails.add(String(meta.from));
    if (Array.isArray(meta.to)) {
      for (const to of meta.to) contactEmails.add(String(to));
    }
  }

  const createdAt = deal.createdAt ? new Date(deal.createdAt).getTime() : Date.now();
  const stageVelocityDays = Math.max(
    1,
    Math.round((Date.now() - createdAt) / (24 * 60 * 60 * 1000)),
  );

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
