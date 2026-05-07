import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, activities, companies } from "@/db/schema";
import { and, eq, notInArray, sql, desc } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  runMonteCarloForecast,
  type ActiveDeal,
} from "@/lib/forecasting/monte-carlo";
import type { ScoringModel } from "@/lib/scoring/predictive-scorer";

/**
 * GET /api/forecast?granularity=month&horizon=3&simulations=10000
 *
 * Runs a Monte Carlo revenue forecast for the authenticated tenant.
 * Returns confidence intervals (p10/p50/p90) per time period.
 */
export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const { tenantId } = authCtx;
    const { searchParams } = new URL(req.url, "http://localhost");

    const granularity =
      (searchParams.get("granularity") as "week" | "month" | "quarter") ||
      "month";
    const horizonMonths = Math.min(
      Math.max(1, Number(searchParams.get("horizon") || 3)),
      12,
    );
    const simulations = Math.min(
      Math.max(100, Number(searchParams.get("simulations") || 10000)),
      50000,
    );

    // Fetch all open deals
    const openDeals = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          notInArray(deals.stage, ["won", "lost"]),
        ),
      );

    if (openDeals.length === 0) {
      return Response.json({
        scenarios: [],
        topDeals: [],
        riskFactors: ["No open deals in pipeline"],
        simulationCount: 0,
        computedAt: new Date().toISOString(),
      });
    }

    // Load scoring model from tenant settings (trained by weekly Inngest cron)
    const settings = await getTenantSettings(tenantId);
    const scoringModel: ScoringModel | null =
      (settings as Record<string, unknown>).scoringModel as ScoringModel | null ?? null;

    // Build ActiveDeal array with features for predictive scoring
    const activeDeals: ActiveDeal[] = await Promise.all(
      openDeals.map(async (deal) => {
        const lastUpdate = deal.updatedAt || deal.createdAt;
        const daysInCurrentStage = lastUpdate
          ? Math.floor(
              (Date.now() - new Date(lastUpdate).getTime()) / 86400000,
            )
          : 0;

        // Load company for industry/size features
        let industry = "unknown";
        let companySize = "unknown";
        if (deal.companyId) {
          const [company] = await db
            .select({
              industry: companies.industry,
              size: companies.size,
            })
            .from(companies)
            .where(eq(companies.id, deal.companyId))
            .limit(1);
          if (company) {
            industry = company.industry || "unknown";
            companySize = company.size || "unknown";
          }
        }

        // Count contacts engaged and meetings for this deal
        const dealEntityId = deal.companyId || deal.id;
        const [activityStats] = await db
          .select({
            totalActivities: sql<number>`count(*)`,
            meetingCount: sql<number>`count(*) FILTER (WHERE ${activities.channel} = 'meeting')`,
            positiveCount: sql<number>`count(*) FILTER (WHERE ${activities.sentiment} = 'positive')`,
            negativeCount: sql<number>`count(*) FILTER (WHERE ${activities.sentiment} = 'negative')`,
          })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              eq(activities.entityId, dealEntityId),
            ),
          );

        const meetingCount = Number(activityStats?.meetingCount ?? 0);
        const positiveCount = Number(activityStats?.positiveCount ?? 0);
        const negativeCount = Number(activityStats?.negativeCount ?? 0);

        let emailSentiment: "positive" | "neutral" | "negative" = "neutral";
        if (positiveCount > negativeCount * 2) emailSentiment = "positive";
        else if (negativeCount > positiveCount * 2) emailSentiment = "negative";

        // Check deal properties for champion / competitor signals
        const props = (deal.properties || {}) as Record<string, unknown>;
        const hasChampion = !!(
          props.champion ||
          props.has_champion ||
          props.champion_identified
        );
        const hasCompetitor = !!(
          props.competitor ||
          props.has_competitor ||
          props.competitor_present
        );

        return {
          id: deal.id,
          name: deal.name,
          value: deal.value ? Number(deal.value) : 0,
          stage: deal.stage || "lead",
          expectedCloseDate: deal.expectedCloseDate
            ? new Date(deal.expectedCloseDate).toISOString()
            : null,
          daysInCurrentStage,
          features: {
            industry,
            companySize,
            contactsEngaged: Math.min(
              10,
              Math.ceil(Number(activityStats?.totalActivities ?? 0) / 5),
            ),
            meetingCount,
            emailSentiment,
            hasChampion,
            hasCompetitor,
          },
        };
      }),
    );

    const result = runMonteCarloForecast(activeDeals, scoringModel, {
      simulations,
      horizonMonths,
      granularity,
    });

    return Response.json(result);
  });
}
