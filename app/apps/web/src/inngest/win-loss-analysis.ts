/**
 * Inngest function: Automatic Win/Loss Analysis
 *
 * Triggered when a deal is closed (won or lost). Runs the full
 * win-loss analysis engine and sends a notification to the deal
 * owner with the post-mortem results.
 *
 * Event: deal/closed
 * Data: { dealId: string, tenantId: string, outcome: "won" | "lost" }
 */

import { inngest } from "./client";
import { db } from "@/db";
import { deals, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { analyzeWinLoss } from "@/lib/analysis/win-loss-engine";
import { sendNotification } from "@/lib/notifications";

export const analyzeClosedDeal = inngest.createFunction(
  {
    id: "analyze-closed-deal",
    name: "Win/Loss Analysis",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(
        `[DEAD LETTER] analyze-closed-deal failed for ${(event as any).data?.dealId}:`,
        error.message,
      );
    },
    triggers: [{ event: "deal/closed" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        dealId: string;
        tenantId: string;
        outcome: "won" | "lost";
      };
    };
    step: any;
  }) => {
    const { dealId, tenantId, outcome } = event.data;

    // 1. Run the analysis
    const analysis = await step.run("run-analysis", async () => {
      return analyzeWinLoss(dealId, tenantId);
    });

    // 2. Fetch deal owner for notification
    const dealOwner = await step.run("fetch-owner", async () => {
      const [deal] = await db
        .select({ ownerId: deals.ownerId, name: deals.name })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);

      if (!deal?.ownerId) return null;

      // Find the app user matching this owner
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, deal.ownerId), eq(users.tenantId, tenantId)))
        .limit(1);

      return user ? { userId: user.id, dealName: deal.name } : null;
    });

    // 3. Send notification to deal owner
    if (dealOwner) {
      await step.run("notify-owner", async () => {
        const topFactors = analysis.keyFactors
          .filter((f: any) => f.impact !== "neutral")
          .slice(0, 3)
          .map((f: any) => `${f.impact === "positive" ? "+" : "-"} ${f.factor}`)
          .join("; ");

        await sendNotification({
          tenantId,
          userId: dealOwner.userId,
          type: outcome === "won" ? "deal_won" : "deal_lost",
          title: `Win/Loss Analysis: ${dealOwner.dealName}`,
          body: `Post-mortem complete. Key factors: ${topFactors || "See analysis for details"}. ${analysis.lessonsLearned.length} lessons, ${analysis.recommendedChanges.length} recommendations.`,
          entityType: "deal",
          entityId: dealId,
        });
      });
    }

    return {
      dealId,
      outcome,
      factorsCount: analysis.keyFactors.length,
      lessonsCount: analysis.lessonsLearned.length,
      recommendationsCount: analysis.recommendedChanges.length,
    };
  },
);
