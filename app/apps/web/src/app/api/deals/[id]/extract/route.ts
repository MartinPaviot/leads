import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const extractionSchema = z.object({
  budget: z.string().describe("Budget amount or range mentioned, or 'unknown'"),
  teamSize: z.string().describe("Team size or number of users, or 'unknown'"),
  competitorTools: z.array(z.string()).describe("Competitor tools or solutions currently in use"),
  timeline: z.string().describe("Decision or implementation timeline, or 'unknown'"),
  decisionMaker: z.string().describe("Name and title of decision maker, or 'unknown'"),
  nextSteps: z.array(z.string()).describe("Agreed or implied next steps"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { notes } = body;

    if (!notes || typeof notes !== "string") {
      return Response.json({ error: "notes string required" }, { status: 400 });
    }

    // Verify deal exists
    const [deal] = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.id, id),
          eq(deals.tenantId, authCtx.tenantId),
          isNull(deals.deletedAt),
        ),
      )
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    const prompt = `Extract structured data from these meeting notes for a sales deal.
Be precise — only extract information that is explicitly stated or strongly implied.
If information is not present, return "unknown" for string fields or empty arrays for array fields.

DEAL: ${deal.name}
CURRENT STAGE: ${deal.stage}

MEETING NOTES:
${notes}

Extract:
1. Budget: any mentioned budget, price range, or spending capacity
2. Team size: number of people on the team or number of seats/licenses needed
3. Competitor tools: any current tools, platforms, or solutions they mentioned using
4. Timeline: when they plan to make a decision or implement
5. Decision maker: who is the decision maker (name and title if mentioned)
6. Next steps: any agreed-upon or implied next steps`;

    const { object } = await tracedGenerateObject({
      model,
      schema: extractionSchema,
      prompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      _trace: { agentId: "deal-extract-intel", tenantId: authCtx.tenantId },
    });
    const result = object as any;

    // Update deal properties with extracted data
    const existingProps = (deal.properties as Record<string, unknown>) || {};
    await db
      .update(deals)
      .set({
        properties: {
          ...existingProps,
          extractedBudget: result.budget,
          extractedTeamSize: result.teamSize,
          extractedCompetitorTools: result.competitorTools,
          extractedTimeline: result.timeline,
          extractedDecisionMaker: result.decisionMaker,
          extractedNextSteps: result.nextSteps,
          extractedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deals.id, id),
          eq(deals.tenantId, authCtx.tenantId),
          isNull(deals.deletedAt),
        ),
      );

    return Response.json({
      budget: result.budget,
      teamSize: result.teamSize,
      competitorTools: result.competitorTools,
      timeline: result.timeline,
      decisionMaker: result.decisionMaker,
      nextSteps: result.nextSteps,
    });
  } catch (error) {
    console.error("Data extraction failed:", error);
    return Response.json({ error: "Data extraction failed" }, { status: 500 });
  }
}
