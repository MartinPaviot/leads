import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const scoreSchema = z.object({
  score: z.number().min(0).max(100).describe("Account score 0-100 based on fit with typical B2B SaaS ICP"),
  reasons: z.array(z.string()).describe("2-3 specific reasons for the score"),
  grade: z.enum(["A", "B", "C", "D", "F"]).describe("Letter grade: A=80-100, B=60-79, C=40-59, D=20-39, F=0-19"),
});

export async function POST(req: Request) {
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

  try {
    const body = await req.json();
    const { companyIds } = body;

    if (!companyIds || !Array.isArray(companyIds)) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    let scored = 0;

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, id))
          .limit(1);

        if (!company) continue;

        const { object } = await generateObject({
          model,
          schema: scoreSchema,
          prompt: `Score this company as a potential B2B SaaS customer on a scale of 0-100.

Company: ${company.name}
Domain: ${company.domain || "unknown"}
Industry: ${company.industry || "unknown"}
Size: ${company.size || "unknown"}
Revenue: ${company.revenue || "unknown"}
Description: ${company.description || "none"}

Score higher for: tech companies, AI/SaaS, well-funded startups, 10-500 employees, $1M-$100M revenue.
Score lower for: consumer businesses, very small (<10) or very large (>5000), unclear business.`,
        });

        await db
          .update(companies)
          .set({
            score: object.score,
            scoreReasons: object.reasons,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, id));

        scored++;
      } catch (err) {
        console.warn(`Failed to score company ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Scoring failed:", error);
    return Response.json({ error: "Scoring failed" }, { status: 500 });
  }
}
