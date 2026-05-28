import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { apiError } from "@/lib/infra/api-errors";
import { db } from "@/db";
import { deals, activities, companies } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { getTenantSettings, getStageNames } from "@/lib/config/tenant-settings";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const analyzeDealsInputSchema = z.object({
  dealIds: z.array(z.string().uuid()).min(1, "dealIds array required").max(10),
});

const dealAnalysisSchema = z.object({
  suggestedStage: z.string().describe("Suggested pipeline stage based on activity"),
  stageReason: z.string().describe("Why this stage is suggested"),
  riskLevel: z.enum(["high", "medium", "low", "none"]).describe("Risk level for this deal"),
  risks: z.array(z.string()).describe("Specific risks identified"),
  summary: z.string().describe("2-3 sentence summary of the deal's current state"),
  nextActions: z.array(z.string()).describe("2-3 recommended next actions"),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return apiError("PROVIDER_UNAVAILABLE", "No LLM API key configured");
  }

  try {
    const raw = await req.json();
    const parsed = analyzeDealsInputSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid request", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { dealIds } = parsed.data;

    // Load tenant pipeline stages
    const settings = await getTenantSettings(authCtx.tenantId);
    const stageList = getStageNames(settings);

    const results: Array<{
      dealId: string;
      suggestedStage: string;
      stageReason: string;
      riskLevel: string;
      risks: string[];
      summary: string;
      nextActions: string[];
    }> = [];

    for (const dealId of dealIds.slice(0, 10)) {
      try {
        const [deal] = await db
          .select()
          .from(deals)
          .where(and(eq(deals.id, dealId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
          .limit(1);

        if (!deal) continue;

        // Get company info
        let companyInfo = "";
        if (deal.companyId) {
          const [company] = await db
            .select()
            .from(companies)
            .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
            .limit(1);
          if (company) {
            companyInfo = `Company: ${company.name}, Industry: ${company.industry || "unknown"}, Size: ${company.size || "unknown"}`;
          }
        }

        // Get activity count for this deal
        const activityResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(activities)
          .where(and(eq(activities.entityId, dealId), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)));
        const activityCount = Number(activityResult[0]?.count || 0);

        const { object } = await tracedGenerateObject({
          model,
          schema: dealAnalysisSchema,
          prompt: `Analyze this sales deal and provide insights.

Deal: ${deal.name}
Current Stage: ${deal.stage}
Value: ${deal.value ? `$${deal.value.toLocaleString()}` : "Unknown"}
${companyInfo}
Activity Count: ${activityCount}
Created: ${deal.createdAt}
Last Updated: ${deal.updatedAt}

Based on the deal data, provide:
1. What stage should this deal be in? (${stageList})
2. What risks exist? (ghosting, stalls, no activity, unclear timeline, competitor)
3. A summary of the deal's current state
4. Recommended next actions

Be realistic — don't assume progress without evidence.`,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
          _trace: { agentId: "deal-analyze", tenantId: authCtx.tenantId },
        });

        // Update deal with summary
        if (!object) continue;
        const analysis = object as any;
        await db
          .update(deals)
          .set({
            summary: analysis.summary,
            properties: {
              ...(deal.properties as Record<string, unknown> || {}),
              riskLevel: analysis.riskLevel,
              risks: analysis.risks,
              suggestedStage: analysis.suggestedStage,
              nextActions: analysis.nextActions,
              analyzedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(and(eq(deals.id, dealId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));

        results.push({
          dealId,
          ...analysis,
        });
      } catch (err) {
        console.warn(`Failed to analyze deal ${dealId}:`, err);
      }
    }

    return Response.json({ success: true, analyzed: results.length, results });
  } catch (error) {
    console.error("Deal analysis failed:", error);
    return apiError("INTERNAL_ERROR", "Deal analysis failed");
  }
}
