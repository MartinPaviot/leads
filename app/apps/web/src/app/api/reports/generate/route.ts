import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { deals, activities, contacts, companies } from "@/db/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const reportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      content: z.string(),
    })
  ),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
});

type ReportType = "pipeline" | "weekly" | "winloss";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { type } = body as { type: ReportType };

    if (!type || !["pipeline", "weekly", "winloss"].includes(type)) {
      return Response.json(
        { error: 'Invalid type. Must be "pipeline", "weekly", or "winloss".' },
        { status: 400 }
      );
    }

    const prompt = await buildPrompt(type, authCtx.tenantId);

    const { object } = await tracedGenerateObject({
      model,
      schema: reportSchema,
      prompt,
      _trace: { agentId: `report-${type}`, tenantId: authCtx.tenantId },
    });

    return Response.json({ success: true, report: object });
  } catch (error) {
    console.error("Report generation failed:", error);
    return Response.json({ error: "Report generation failed" }, { status: 500 });
  }
}

// ── Data fetching & prompt building per report type ─────────

async function buildPrompt(type: ReportType, tenantId: string): Promise<string> {
  switch (type) {
    case "pipeline":
      return buildPipelinePrompt(tenantId);
    case "weekly":
      return buildWeeklyPrompt(tenantId);
    case "winloss":
      return buildWinLossPrompt(tenantId);
  }
}

async function buildPipelinePrompt(tenantId: string): Promise<string> {
  // All deals with stage, value, risk level, days since last activity
  const allDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
      properties: deals.properties,
      summary: deals.summary,
      updatedAt: deals.updatedAt,
      createdAt: deals.createdAt,
    })
    .from(deals)
    .where(eq(deals.tenantId, tenantId));

  // Pipeline analytics
  const totalValue = allDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const wonDeals = allDeals.filter((d) => d.stage === "won");
  const lostDeals = allDeals.filter((d) => d.stage === "lost");
  const closedDeals = wonDeals.length + lostDeals.length;
  const winRate = closedDeals > 0 ? ((wonDeals.length / closedDeals) * 100).toFixed(1) : "N/A";

  // Average days from creation to close (velocity)
  const wonWithDates = wonDeals.filter((d) => d.createdAt && d.updatedAt);
  const avgVelocity =
    wonWithDates.length > 0
      ? (
          wonWithDates.reduce((sum, d) => {
            const created = new Date(d.createdAt!).getTime();
            const updated = new Date(d.updatedAt!).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / wonWithDates.length
        ).toFixed(1)
      : "N/A";

  // Top 5 stalled deals (open deals sorted by oldest updatedAt)
  const openDeals = allDeals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return aTime - bTime;
    });
  const stalledDeals = openDeals.slice(0, 5);

  const now = Date.now();

  const dealsSummary = allDeals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .map((d) => {
      const props = d.properties as Record<string, unknown> | null;
      const riskLevel = props?.riskLevel || "unknown";
      const daysSinceUpdate = d.updatedAt
        ? Math.round((now - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : "unknown";
      return `- ${d.name} | Stage: ${d.stage} | Value: $${d.value || 0} | Risk: ${riskLevel} | Days since activity: ${daysSinceUpdate}`;
    })
    .join("\n");

  const stalledSummary = stalledDeals
    .map((d) => {
      const daysSinceUpdate = d.updatedAt
        ? Math.round((now - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : "unknown";
      return `- ${d.name} | Stage: ${d.stage} | Value: $${d.value || 0} | Stalled ${daysSinceUpdate} days`;
    })
    .join("\n");

  return `Generate an executive pipeline report based on the following CRM data.

PIPELINE ANALYTICS:
- Total pipeline value: $${totalValue.toLocaleString()}
- Total open deals: ${openDeals.length}
- Win rate: ${winRate}%
- Average deal velocity: ${avgVelocity} days
- Won deals: ${wonDeals.length}
- Lost deals: ${lostDeals.length}

ALL OPEN DEALS:
${dealsSummary || "(No open deals)"}

TOP 5 STALLED DEALS:
${stalledSummary || "(None)"}

Generate a structured executive report with:
1. An executive summary of the pipeline health
2. Key metrics and what they indicate
3. Risks and concerns (stalled deals, high-risk deals, pipeline gaps)
4. Actionable recommendations to improve pipeline health and close rates

Be specific and data-driven. Reference actual deal names and values where relevant.`;
}

async function buildWeeklyPrompt(tenantId: string): Promise<string> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Activities from last 7 days grouped by type
  const recentActivities = await db
    .select({
      activityType: activities.activityType,
      count: sql<number>`count(*)`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        gte(activities.occurredAt, sevenDaysAgo)
      )
    )
    .groupBy(activities.activityType);

  // Deals created this week
  const newDeals = await db
    .select({ id: deals.id, name: deals.name, value: deals.value, stage: deals.stage })
    .from(deals)
    .where(and(eq(deals.tenantId, tenantId), gte(deals.createdAt, sevenDaysAgo)));

  // Deals won/lost this week
  const allDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      value: deals.value,
      stage: deals.stage,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        inArray(deals.stage, ["won", "lost"]),
        gte(deals.updatedAt, sevenDaysAgo)
      )
    );
  const wonThisWeek = allDeals.filter((d) => d.stage === "won");
  const lostThisWeek = allDeals.filter((d) => d.stage === "lost");

  // New contacts this week
  const newContacts = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), gte(contacts.createdAt, sevenDaysAgo)));

  // New accounts this week
  const newAccounts = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), gte(companies.createdAt, sevenDaysAgo)));

  const activitiesSummary = recentActivities
    .map((a) => `- ${a.activityType}: ${a.count}`)
    .join("\n");

  const newDealsSummary = newDeals
    .map((d) => `- ${d.name} ($${d.value || 0}, ${d.stage})`)
    .join("\n");

  const wonSummary = wonThisWeek
    .map((d) => `- ${d.name} ($${d.value || 0})`)
    .join("\n");

  const lostSummary = lostThisWeek
    .map((d) => `- ${d.name} ($${d.value || 0})`)
    .join("\n");

  return `Generate a weekly sales activity report based on the following CRM data from the last 7 days.

ACTIVITIES THIS WEEK:
${activitiesSummary || "(No activities)"}

NEW DEALS CREATED:
${newDealsSummary || "(None)"}

DEALS WON THIS WEEK:
${wonSummary || "(None)"}
Total won value: $${wonThisWeek.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}

DEALS LOST THIS WEEK:
${lostSummary || "(None)"}
Total lost value: $${lostThisWeek.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}

NEW CONTACTS: ${Number(newContacts[0]?.count || 0)}
NEW ACCOUNTS: ${Number(newAccounts[0]?.count || 0)}

Generate a structured weekly report with:
1. A concise summary of the week's sales performance
2. Highlights and wins
3. Concerns or areas needing attention
4. Priorities and focus areas for next week

Be specific. Reference actual numbers, deal names, and activity counts.`;
}

async function buildWinLossPrompt(tenantId: string): Promise<string> {
  // All won and lost deals
  const closedDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
      properties: deals.properties,
      summary: deals.summary,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(
      and(eq(deals.tenantId, tenantId), inArray(deals.stage, ["won", "lost"]))
    );

  const wonDeals = closedDeals.filter((d) => d.stage === "won");
  const lostDeals = closedDeals.filter((d) => d.stage === "lost");

  const formatDeal = (d: (typeof closedDeals)[number]) => {
    const props = d.properties as Record<string, unknown> | null;
    const risks = props?.risks || [];
    const riskLevel = props?.riskLevel || "unknown";
    const daysToClose =
      d.createdAt && d.updatedAt
        ? Math.round(
            (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : "unknown";
    return `- ${d.name} | Value: $${d.value || 0} | Risk: ${riskLevel} | Days to close: ${daysToClose} | Summary: ${d.summary || "N/A"} | Risks: ${Array.isArray(risks) ? risks.join(", ") : "none"}`;
  };

  const wonSummary = wonDeals.map(formatDeal).join("\n");
  const lostSummary = lostDeals.map(formatDeal).join("\n");

  return `Generate a win/loss analysis report based on the following CRM data.

WON DEALS (${wonDeals.length} total, $${wonDeals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()} total value):
${wonSummary || "(No won deals)"}

LOST DEALS (${lostDeals.length} total, $${lostDeals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()} total value):
${lostSummary || "(No lost deals)"}

Generate a structured win/loss analysis report with:
1. Summary of overall win/loss performance
2. Patterns identified in won deals (common factors, deal sizes, timelines)
3. Patterns identified in lost deals (common reasons, risk factors, red flags)
4. Data-driven recommendations to increase win rate

Be specific. Reference actual deal names, values, risk factors, and timelines where relevant.`;
}
