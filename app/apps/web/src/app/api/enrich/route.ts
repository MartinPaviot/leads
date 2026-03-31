import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { embedEntity, companyToText } from "@/lib/embeddings";

const enrichmentSchema = z.object({
  industry: z.string().describe("Primary industry (e.g. Fintech, SaaS, AI/ML, Healthcare)"),
  description: z.string().describe("1-2 sentence company description"),
  size: z.string().describe("Employee count range (e.g. 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+)"),
  revenue: z.string().describe("Estimated annual revenue range (e.g. <$1M, $1M-$10M, $10M-$50M, $50M-$100M, $100M+)"),
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

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    let enriched = 0;
    let failed = 0;

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, id))
          .limit(1);

        if (!company) {
          failed++;
          continue;
        }

        // Skip if already enriched
        if (company.industry && company.description) {
          enriched++;
          continue;
        }

        const { object } = await generateObject({
          model,
          schema: enrichmentSchema,
          prompt: `Research the company "${company.name}"${company.domain ? ` (domain: ${company.domain})` : ""}.
Provide accurate firmographic data. If you're not sure about exact numbers, give your best estimate based on what you know.
If you don't recognize the company, provide reasonable estimates based on the name and domain.`,
        });

        // Update company
        await db
          .update(companies)
          .set({
            industry: object.industry,
            description: object.description,
            size: object.size,
            revenue: object.revenue,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, id));

        // Re-embed with enriched data
        const text = companyToText({
          name: company.name,
          domain: company.domain,
          industry: object.industry,
          revenue: object.revenue,
          size: object.size,
          description: object.description,
        });
        if (text && process.env.OPENAI_API_KEY) {
          await embedEntity("default", "company", id, text).catch(console.warn);
        }

        enriched++;
      } catch (err) {
        console.warn(`Failed to enrich company ${id}:`, err);
        failed++;
      }
    }

    return Response.json({ success: true, enriched, failed });
  } catch (error) {
    console.error("Enrichment failed:", error);
    return Response.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
