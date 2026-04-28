/**
 * Inngest cron: Daily Stall Prediction
 *
 * Runs daily at 7:00 AM UTC to predict which deals are about to stall.
 * Sends notifications for high-probability stalls so founders can
 * intervene before momentum is lost.
 *
 * Also triggered on-demand via the "stall-prediction/requested" event
 * for the dashboard's "deals at risk" section.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants, users, deals } from "@/db/schema";
import { eq, sql, notInArray } from "drizzle-orm";
import { predictStalls, type StallPrediction } from "@/lib/analysis/stall-predictor";
import { sendNotification } from "@/lib/notifications";

/**
 * Daily cron: runs stall prediction for all active tenants.
 */
export const dailyStallPrediction = inngest.createFunction(
  {
    id: "daily-stall-prediction",
    name: "Daily Stall Prediction",
    retries: 1,
    triggers: [
      { cron: "0 7 * * *" }, // 7 AM UTC daily
    ],
  },
  async ({ step }: { step: any }) => {
    // Find all tenants with open deals
    const activeTenants = await step.run("find-active-tenants", async () => {
      const result = await db
        .selectDistinct({ tenantId: deals.tenantId })
        .from(deals)
        .where(
          notInArray(deals.stage, ["won", "lost"]),
        );
      return result.map((r) => r.tenantId);
    });

    let totalPredictions = 0;
    let totalNotifications = 0;

    for (const tenantId of activeTenants) {
      const result = await step.run(
        `predict-stalls-${tenantId}`,
        async () => {
          const predictions = await predictStalls(tenantId);

          // Filter to high-probability stalls (>0.5) for notifications
          const highRisk = predictions.filter((p) => p.stallProbability >= 0.5);

          if (highRisk.length === 0) {
            return { predictions: predictions.length, notifications: 0 };
          }

          // Find tenant users to notify (owners of at-risk deals, or all admins)
          const tenantUsers = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.tenantId, tenantId));

          if (tenantUsers.length === 0) {
            return { predictions: predictions.length, notifications: 0 };
          }

          // Send a single digest notification to each user
          let notifCount = 0;
          for (const user of tenantUsers) {
            const topDeals = highRisk
              .slice(0, 3)
              .map(
                (p) =>
                  `${p.dealName} (${Math.round(p.stallProbability * 100)}% stall risk)`,
              )
              .join(", ");

            await sendNotification({
              tenantId,
              userId: user.id,
              type: "deal_risk",
              title: `${highRisk.length} deal${highRisk.length > 1 ? "s" : ""} at risk of stalling`,
              body: `Deals at risk: ${topDeals}. Top intervention: ${highRisk[0]?.suggestedInterventions[0]?.action || "Review pipeline"}`,
            });
            notifCount++;
          }

          return {
            predictions: predictions.length,
            notifications: notifCount,
          };
        },
      );

      totalPredictions += result.predictions;
      totalNotifications += result.notifications;
    }

    return {
      tenantsProcessed: activeTenants.length,
      totalPredictions,
      totalNotifications,
    };
  },
);

/**
 * On-demand stall prediction for a specific tenant.
 * Used by the dashboard's "deals at risk" section.
 */
export const onDemandStallPrediction = inngest.createFunction(
  {
    id: "on-demand-stall-prediction",
    name: "On-Demand Stall Prediction",
    retries: 1,
    triggers: [{ event: "stall-prediction/requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { tenantId: string } };
    step: any;
  }) => {
    const { tenantId } = event.data;

    const predictions: StallPrediction[] = await step.run("predict-stalls", async () => {
      return predictStalls(tenantId);
    });

    return {
      tenantId,
      predictions,
      count: predictions.length,
      highRisk: predictions.filter((p) => p.stallProbability >= 0.5).length,
    };
  },
);
