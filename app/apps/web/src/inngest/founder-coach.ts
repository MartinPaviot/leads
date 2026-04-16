/**
 * Differentiation Angle 3: Daily Founder Coaching Brief
 *
 * The solo founder doesn't have a manager. The agent IS the manager.
 * Every weekday at 8am, it:
 * 1. Generates deal briefs for all open deals
 * 2. Scores yesterday's outgoing emails
 * 3. Detects selling pattern issues
 * 4. Generates today's priorities
 * 5. Delivers as notification + chat message
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  activities,
  deals,
  coachingInsights,
  notifications,
  users,
  outboundEmails,
} from "@/db/schema";
import { and, eq, gte, lte, desc, notInArray, count } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { ageInStage } from "@/lib/deal-helpers";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const founderBriefSchema = z.object({
  greeting: z.string(),
  pipelineHealth: z.string(),
  patternInsights: z.array(z.object({
    insight: z.string(),
    type: z.enum(["positive", "warning", "critical"]),
  })),
  todaysPriorities: z.array(z.object({
    priority: z.string(),
    reason: z.string(),
    dealName: z.string().optional(),
  })),
  motivationalNote: z.string(),
});

export const dailyFounderBrief = inngest.createFunction(
  {
    id: "daily-founder-brief",
    retries: 1,
    triggers: [{ cron: "0 8 * * 1-5" }], // Weekdays 8am UTC
  },
  async ({ step }: { step: any }) => {
    const adminUsers = await step.run("list-admins", async () => {
      return db
        .select({ id: users.id, tenantId: users.tenantId, firstName: users.firstName })
        .from(users)
        .where(eq(users.role, "admin"));
    });

    let briefsSent = 0;

    for (const user of adminUsers) {
      if (!user.tenantId) continue;

      await step.run(`brief-${user.id}`, async () => {
        const tenantId = user.tenantId!;
        const model = getLLMModel();
        if (!model) return;

        const yesterday = new Date(Date.now() - 86400000);
        const today = new Date();

        // 1. Pipeline snapshot
        const openDeals = await db
          .select()
          .from(deals)
          .where(
            and(
              eq(deals.tenantId, tenantId),
              notInArray(deals.stage, ["won", "lost"]),
            ),
          );

        const stalledDeals = openDeals.filter((d) => {
          const age = ageInStage(d.updatedAt, d.stage);
          return age && age.days > 14;
        });

        const totalValue = openDeals.reduce(
          (sum, d) => sum + (d.value ? Number(d.value) : 0),
          0,
        );

        // 2. Yesterday's activity
        const [yesterdayEmails] = await db
          .select({ count: count() })
          .from(outboundEmails)
          .where(
            and(
              eq(outboundEmails.tenantId, tenantId),
              gte(outboundEmails.sentAt, yesterday),
              lte(outboundEmails.sentAt, today),
            ),
          );

        const yesterdayActivities = await db
          .select({
            activityType: activities.activityType,
            summary: activities.summary,
          })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              gte(activities.occurredAt, yesterday),
              lte(activities.occurredAt, today),
            ),
          )
          .orderBy(desc(activities.occurredAt))
          .limit(20);

        // 3. Recent coaching scores
        const recentInsights = await db
          .select({
            category: coachingInsights.category,
            score: coachingInsights.score,
          })
          .from(coachingInsights)
          .where(
            and(
              eq(coachingInsights.tenantId, tenantId),
              eq(coachingInsights.userId, user.id),
              gte(coachingInsights.createdAt, new Date(Date.now() - 7 * 86400000)),
            ),
          );

        const avgScore = recentInsights.length > 0
          ? recentInsights.reduce((sum, i) => sum + (i.score ?? 0), 0) / recentInsights.length
          : null;

        // 4. Upcoming meetings
        const upcomingMeetings = await db
          .select({ summary: activities.summary, occurredAt: activities.occurredAt })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              eq(activities.activityType, "meeting_scheduled"),
              gte(activities.occurredAt, today),
              lte(activities.occurredAt, new Date(Date.now() + 86400000)),
            ),
          );

        // 5. Generate the brief via LLM
        const brief = await tracedGenerateObject({
          model,
          schema: founderBriefSchema,
          prompt: `You are a personal sales coach for a founder running their own sales. Generate a concise morning brief.

## Founder
Name: ${user.firstName || "Founder"}

## Pipeline Snapshot
- Open deals: ${openDeals.length}
- Total value: $${totalValue.toLocaleString()}
- Stalled (>14 days): ${stalledDeals.length}
- Stalled deals: ${stalledDeals.map((d) => `"${d.name}" (${d.stage}, ${ageInStage(d.updatedAt, d.stage)?.days}d)`).join(", ") || "none"}

## Yesterday's Activity
- Emails sent: ${Number(yesterdayEmails?.count ?? 0)}
- Activities: ${yesterdayActivities.length}
- Key activities: ${yesterdayActivities.slice(0, 5).map((a) => `${a.activityType}: ${a.summary || "no summary"}`).join("; ")}

## Coaching Scores (last 7 days)
- Average score: ${avgScore != null ? `${(avgScore * 100).toFixed(0)}%` : "no data yet"}
- Insights count: ${recentInsights.length}
${recentInsights.length > 0 ? `- Weakest area: ${findWeakestCategory(recentInsights)}` : ""}

## Today
- Upcoming meetings: ${upcomingMeetings.length}
${upcomingMeetings.map((m) => `  - ${m.summary || "Meeting"} at ${m.occurredAt?.toISOString().split("T")[1]?.slice(0, 5) || "?"}`).join("\n")}

## Generate
1. **greeting**: Short, energizing ("Good morning [name], here's your pipeline pulse")
2. **pipelineHealth**: One sentence on overall pipeline state
3. **patternInsights**: 2-4 observations about selling patterns:
   - positive: "Your follow-up timing improved this week"
   - warning: "3 deals haven't been touched in 5+ days"
   - critical: "2 proposals sent without addressing known objections"
4. **todaysPriorities**: 3-5 specific actions for today, ordered by impact. Include deal names.
5. **motivationalNote**: One line to keep them going ("Small progress compounds — you're building momentum")

Be specific, not generic. Reference actual deal names and numbers.`,
          _trace: {
            agentId: "founder-daily-brief",
            tenantId,
          },
        });

        const b = brief.object;

        // Format the notification
        const body = [
          b.pipelineHealth,
          "",
          ...b.patternInsights.map((p: { type: string; insight: string }) => {
            const icon = p.type === "positive" ? "+" : p.type === "warning" ? "~" : "!";
            return `${icon} ${p.insight}`;
          }),
          "",
          "TODAY:",
          ...b.todaysPriorities.map(
            (p: { priority: string; reason: string; dealName?: string }, i: number) =>
              `${i + 1}. ${p.priority}${p.dealName ? ` (${p.dealName})` : ""} — ${p.reason}`,
          ),
          "",
          b.motivationalNote,
        ].join("\n");

        await db.insert(notifications).values({
          tenantId,
          userId: user.id,
          type: "system",
          title: b.greeting,
          body: body.slice(0, 1500),
        });

        briefsSent++;
      });
    }

    return { briefsSent };
  },
);

function findWeakestCategory(
  insights: Array<{ category: string; score: number | null }>,
): string {
  const categoryScores = new Map<string, number[]>();
  for (const i of insights) {
    if (i.score == null) continue;
    const list = categoryScores.get(i.category) || [];
    list.push(i.score);
    categoryScores.set(i.category, list);
  }

  let weakest = "general";
  let lowestAvg = 1;
  for (const [cat, scores] of categoryScores) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < lowestAvg) {
      lowestAvg = avg;
      weakest = cat;
    }
  }
  return weakest;
}
