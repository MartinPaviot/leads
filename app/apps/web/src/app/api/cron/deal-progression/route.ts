import { db } from "@/db";
import { activities, deals, notifications, tenants, users } from "@/db/schema";
import { eq, and, desc, sql, ne, gte } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { getTenantSettings, type PipelineStageDef } from "@/lib/tenant-settings";
import { verifyCronRequest } from "@/lib/cron-auth";

const progressionSchema = z.object({
  shouldProgress: z.boolean().describe("Whether the deal should move to the next stage"),
  reason: z.string().describe("One-sentence explanation for the decision"),
});

/**
 * AI Deal Stage Auto-Progression
 *
 * Evaluates active deals against stage descriptions and recent activity.
 * If aiFillMode="auto", moves the deal. If "suggest", creates a notification.
 *
 * Run as cron every 12-24h or on-demand.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    const results: Array<{ tenantId: string; evaluated: number; progressed: number; suggested: number }> = [];

    for (const tenant of allTenants) {
      const tenantResult = { tenantId: tenant.id, evaluated: 0, progressed: 0, suggested: 0 };

      const settings = await getTenantSettings(tenant.id);
      const stages: PipelineStageDef[] = settings.pipelineStages || [];

      // Skip if no stage descriptions configured
      if (stages.length === 0 || stages.every((s) => !s.description)) {
        results.push(tenantResult);
        continue;
      }

      // Build ordered stage list (only in_progress stages)
      const orderedStages = stages.filter((s) => s.category !== "done");
      const stageIndex = new Map(orderedStages.map((s, i) => [s.name.toLowerCase(), i]));

      // Fetch active deals (not won/lost, active in last 30 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const activeDeals = await db
        .select({
          id: deals.id,
          name: deals.name,
          stage: deals.stage,
          companyId: deals.companyId,
          updatedAt: deals.updatedAt,
        })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, tenant.id),
            ne(deals.stage, "won"),
            ne(deals.stage, "lost"),
          )
        )
        .orderBy(desc(deals.updatedAt))
        .limit(20); // Batch limit for cost control

      for (const deal of activeDeals) {
        try {
          if (!deal.stage) continue;
          const currentStageIdx = stageIndex.get(deal.stage.toLowerCase());
          if (currentStageIdx === undefined || currentStageIdx >= orderedStages.length - 1) continue;

          const currentStageDef = orderedStages[currentStageIdx];
          const nextStageDef = orderedStages[currentStageIdx + 1];

          // Skip if aiFillMode is off or undefined
          if (!currentStageDef.aiFillMode || currentStageDef.aiFillMode === "off") continue;

          // Skip if next stage description is empty
          if (!nextStageDef.description) continue;

          // Fetch recent activities for this deal
          const recentActivities = await db
            .select({
              summary: activities.summary,
              activityType: activities.activityType,
              occurredAt: activities.occurredAt,
              sentiment: activities.sentiment,
            })
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, tenant.id),
                eq(activities.entityType, "deal"),
                eq(activities.entityId, deal.id),
                gte(activities.occurredAt, sevenDaysAgo),
              )
            )
            .orderBy(desc(activities.occurredAt))
            .limit(10);

          // Skip if no recent activity
          if (recentActivities.length === 0) continue;

          tenantResult.evaluated++;

          const activitiesSummary = recentActivities
            .map((a) => `[${a.activityType}] ${a.summary || "No summary"}${a.sentiment ? ` (${a.sentiment})` : ""}`)
            .join("\n");

          // Ask Claude if the deal should progress
          const result = await tracedGenerateObject({
            model: anthropic("claude-haiku-4-5-20251001"),
            schema: progressionSchema,
            prompt: `You are evaluating whether a sales deal should move to the next pipeline stage.

Current stage: "${currentStageDef.name}" — ${currentStageDef.description || "No description"}
Next stage: "${nextStageDef.name}" — ${nextStageDef.description || "No description"}

Deal: ${deal.name}

Recent activities (last 7 days):
${activitiesSummary}

Based on these activities, should this deal progress from "${currentStageDef.name}" to "${nextStageDef.name}"?
Only say YES if the activities clearly indicate the deal has met the criteria for the next stage.`,
            maxTokens: 100,
            _meta: { tenantId: tenant.id, feature: "deal-auto-progression" },
          });

          if (result.object.shouldProgress) {
            if (currentStageDef.aiFillMode === "auto") {
              // Auto-progress: update the deal
              await db
                .update(deals)
                .set({
                  stage: nextStageDef.name.toLowerCase() as typeof deal.stage,
                  updatedAt: new Date(),
                })
                .where(and(eq(deals.id, deal.id), eq(deals.tenantId, tenant.id)));

              // Log the activity
              await db.insert(activities).values({
                tenantId: tenant.id,
                actorType: "system",
                entityType: "deal",
                entityId: deal.id,
                activityType: "deal_stage_changed",
                summary: `AI auto-progressed from ${currentStageDef.name} to ${nextStageDef.name}: ${result.object.reason}`,
                metadata: {
                  oldStage: currentStageDef.name,
                  newStage: nextStageDef.name,
                  reason: result.object.reason,
                  triggeredBy: "ai_auto_progression",
                },
              });

              tenantResult.progressed++;
            } else {
              // Suggest mode: create notification
              const tenantUsers = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.tenantId, tenant.id))
                .limit(5);

              for (const user of tenantUsers) {
                await db.insert(notifications).values({
                  tenantId: tenant.id,
                  userId: user.id,
                  type: "deal_risk",
                  title: `${deal.name}: Ready to progress?`,
                  body: `AI suggests moving from ${currentStageDef.name} to ${nextStageDef.name}. ${result.object.reason}`,
                  entityType: "deal",
                  entityId: deal.id,
                });
              }

              tenantResult.suggested++;
            }
          }
        } catch (err) {
          console.warn(`Failed to evaluate deal ${deal.id}:`, err);
        }
      }

      results.push(tenantResult);
    }

    const totalEvaluated = results.reduce((s, r) => s + r.evaluated, 0);
    const totalProgressed = results.reduce((s, r) => s + r.progressed, 0);
    const totalSuggested = results.reduce((s, r) => s + r.suggested, 0);

    return Response.json({
      success: true,
      tenants: results.length,
      evaluated: totalEvaluated,
      progressed: totalProgressed,
      suggested: totalSuggested,
    });
  } catch (error) {
    console.error("Deal progression cron failed:", error);
    return Response.json({ error: "Deal progression failed" }, { status: 500 });
  }
}
