/**
 * Skill Quality Audit — Daily production monitoring.
 *
 * Runs every day at 06:00 UTC. For each tenant:
 * 1. Queries skill traces from last 24h
 * 2. Computes per-skill quality metrics (mean score, error rate, degradation rate)
 * 3. Compares to 7-day rolling average
 * 4. Flags Tier-1 regressions > 5%
 */

import { inngest } from "./client";
import { db } from "@/db";
import { agentTraces, tenants } from "@/db/schema";
import { eq, gte, and, sql, desc } from "drizzle-orm";
import { SKILL_QUALITY_CONFIGS } from "@/skills/skill-quality-config";
import logger from "@/lib/observability/logger";

export const cronSkillQualityAudit = inngest.createFunction(
  {
    id: "cron-skill-quality-audit",
    name: "Skill Quality Audit (daily)",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }: { step: any }) => {
    const allTenants = await step.run("get-tenants", async () => {
      return db.select({ id: tenants.id }).from(tenants);
    });

    const alerts: Array<{
      tenantId: string;
      skill: string;
      tier: number;
      currentScore: number;
      rollingAvg: number;
      regression: number;
    }> = [];

    for (const tenant of allTenants) {
      const tenantAlerts = await step.run(`audit-${tenant.id}`, async () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const recentTraces = await db
          .select({
            agentId: agentTraces.agentId,
            evalScore: agentTraces.evalScore,
            status: agentTraces.status,
            latencyMs: agentTraces.latencyMs,
          })
          .from(agentTraces)
          .where(
            and(
              eq(agentTraces.tenantId, tenant.id),
              gte(agentTraces.createdAt, oneDayAgo),
              sql`${agentTraces.agentId} LIKE 'skill-%'`,
            ),
          );

        const rollingTraces = await db
          .select({
            agentId: agentTraces.agentId,
            evalScore: agentTraces.evalScore,
          })
          .from(agentTraces)
          .where(
            and(
              eq(agentTraces.tenantId, tenant.id),
              gte(agentTraces.createdAt, sevenDaysAgo),
              sql`${agentTraces.agentId} LIKE 'skill-%'`,
            ),
          );

        const tenantResults: typeof alerts = [];

        const skillGroups = new Map<string, typeof recentTraces>();
        for (const t of recentTraces) {
          const slug = t.agentId.replace("skill-", "");
          const arr = skillGroups.get(slug) || [];
          arr.push(t);
          skillGroups.set(slug, arr);
        }

        const rollingGroups = new Map<string, number[]>();
        for (const t of rollingTraces) {
          const slug = t.agentId.replace("skill-", "");
          const arr = rollingGroups.get(slug) || [];
          if (t.evalScore != null) arr.push(t.evalScore);
          rollingGroups.set(slug, arr);
        }

        for (const [slug, traces] of skillGroups) {
          const config = SKILL_QUALITY_CONFIGS.get(slug);
          if (!config || config.tier > 1) continue;

          const scores = traces
            .filter((t) => t.evalScore != null)
            .map((t) => t.evalScore!);
          if (scores.length === 0) continue;

          const currentScore = scores.reduce((a, b) => a + b, 0) / scores.length;

          const rollingScores = rollingGroups.get(slug) || [];
          const rollingAvg =
            rollingScores.length > 0
              ? rollingScores.reduce((a, b) => a + b, 0) / rollingScores.length
              : currentScore;

          const regression = rollingAvg - currentScore;

          if (regression > 0.05 || currentScore < config.minQualityScore) {
            tenantResults.push({
              tenantId: tenant.id,
              skill: slug,
              tier: config.tier,
              currentScore,
              rollingAvg,
              regression,
            });
          }
        }

        return tenantResults;
      });

      alerts.push(...tenantAlerts);
    }

    if (alerts.length > 0) {
      logger.warn("Skill quality audit: regressions detected", {
        alertCount: alerts.length,
        alerts: alerts.map((a) => `${a.skill}: ${a.currentScore.toFixed(2)} (was ${a.rollingAvg.toFixed(2)})`),
      });
    }

    return {
      tenantsAudited: allTenants.length,
      alertCount: alerts.length,
      alerts,
    };
  },
);
