import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
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
      .where(eq(deals.id, id))
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

    const { object } = await generateObject({
      model,
      schema: extractionSchema,
      prompt,
    });

    // Update deal properties with extracted data
    const existingProps = (deal.properties as Record<string, unknown>) || {};
    await db
      .update(deals)
      .set({
        properties: {
          ...existingProps,
          extractedBudget: object.budget,
          extractedTeamSize: object.teamSize,
          extractedCompetitorTools: object.competitorTools,
          extractedTimeline: object.timeline,
          extractedDecisionMaker: object.decisionMaker,
          extractedNextSteps: object.nextSteps,
          extractedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id));

    return Response.json({
      budget: object.budget,
      teamSize: object.teamSize,
      competitorTools: object.competitorTools,
      timeline: object.timeline,
      decisionMaker: object.decisionMaker,
      nextSteps: object.nextSteps,
    });
  } catch (error) {
    console.error("Data extraction failed:", error);
    return Response.json({ error: "Data extraction failed" }, { status: 500 });
  }
}
