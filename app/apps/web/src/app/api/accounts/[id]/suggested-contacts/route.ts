import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe("Full name of the suggested contact"),
      title: z.string().describe("Job title — focus on decision-makers: CEO, CTO, VP Sales, Head of Engineering, etc."),
      reason: z.string().describe("Why this person is worth reaching out to — their role in buying decisions"),
    })
  ),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ suggestions: [] });
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { object } = await generateObject({
      model,
      schema: suggestionsSchema,
      prompt: `Suggest 3-5 key decision-maker contacts to reach out to at this company for a B2B sales conversation.

Company: ${company.name}
Domain: ${company.domain || "unknown"}
Industry: ${company.industry || "unknown"}
Size: ${company.size || "unknown"}

Focus on:
- C-suite (CEO, CTO, CFO, CRO)
- VP-level (VP Sales, VP Engineering, VP Product)
- Directors and Heads of relevant departments

Generate realistic but fictional names. Each should have a clear reason why they'd be involved in purchasing decisions.`,
    });

    return Response.json({ suggestions: object.suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
