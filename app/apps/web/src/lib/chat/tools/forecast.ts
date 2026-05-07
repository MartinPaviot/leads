import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { db } from "@/db";
import { deals, activities, companies } from "@/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  runMonteCarloForecast,
  type ActiveDeal,
} from "@/lib/forecasting/monte-carlo";
import type { ScoringModel } from "@/lib/scoring/predictive-scorer";

export function buildForecastTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    getRevenueForcast: makeTool({
      description: `Run a Monte Carlo revenue forecast across the entire pipeline. Simulates thousands of possible outcomes to compute confidence intervals (pessimistic/likely/optimistic). Returns per-period forecasts with p10/p50/p90, top contributing deals, and risk factors. Use when the user asks "what will we close this quarter", "revenue forecast", "pipeline forecast", "how much revenue this month", "what's our forecast", or "predict revenue".`,
      inputSchema: z.object({
        granularity: z
          .enum(["week", "month", "quarter"])
          .optional()
          .describe("Time period granularity (default: month)"),
        horizonMonths: z
          .number()
          .min(1)
          .max(12)
          .optional()
          .describe("How many months ahead to forecast (default: 3)"),
      }),
      execute: async (input) => {
        // Fetch open deals
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
          return {
            message: "No open deals in pipeline to forecast.",
            scenarios: [],
            riskFactors: ["Empty pipeline"],
          };
        }

        // Load scoring model
        const settings = await getTenantSettings(tenantId);
        const scoringModel: ScoringModel | null =
          (settings as Record<string, unknown>).scoringModel as ScoringModel | null ?? null;

        // Build ActiveDeal array
        const activeDeals: ActiveDeal[] = await Promise.all(
          openDeals.map(async (deal) => {
            const lastUpdate = deal.updatedAt || deal.createdAt;
            const daysInCurrentStage = lastUpdate
              ? Math.floor(
                  (Date.now() - new Date(lastUpdate).getTime()) / 86400000,
                )
              : 0;

            let industry = "unknown";
            let companySize = "unknown";
            if (deal.companyId) {
              const [company] = await db
                .select({ industry: companies.industry, size: companies.size })
                .from(companies)
                .where(eq(companies.id, deal.companyId))
                .limit(1);
              if (company) {
                industry = company.industry || "unknown";
                companySize = company.size || "unknown";
              }
            }

            const dealEntityId = deal.companyId || deal.id;
            const [stats] = await db
              .select({
                total: sql<number>`count(*)`,
                meetings: sql<number>`count(*) FILTER (WHERE ${activities.channel} = 'meeting')`,
                positive: sql<number>`count(*) FILTER (WHERE ${activities.sentiment} = 'positive')`,
                negative: sql<number>`count(*) FILTER (WHERE ${activities.sentiment} = 'negative')`,
              })
              .from(activities)
              .where(
                and(
                  eq(activities.tenantId, tenantId),
                  eq(activities.entityId, dealEntityId),
                ),
              );

            const pos = Number(stats?.positive ?? 0);
            const neg = Number(stats?.negative ?? 0);
            let emailSentiment: "positive" | "neutral" | "negative" = "neutral";
            if (pos > neg * 2) emailSentiment = "positive";
            else if (neg > pos * 2) emailSentiment = "negative";

            const props = (deal.properties || {}) as Record<string, unknown>;

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
                  Math.ceil(Number(stats?.total ?? 0) / 5),
                ),
                meetingCount: Number(stats?.meetings ?? 0),
                emailSentiment,
                hasChampion: !!(
                  props.champion ||
                  props.has_champion ||
                  props.champion_identified
                ),
                hasCompetitor: !!(
                  props.competitor ||
                  props.has_competitor ||
                  props.competitor_present
                ),
              },
            };
          }),
        );

        const result = runMonteCarloForecast(activeDeals, scoringModel, {
          simulations: 10_000,
          horizonMonths: input.horizonMonths ?? 3,
          granularity: input.granularity ?? "month",
        });

        return result;
      },
    }),
  };
}
