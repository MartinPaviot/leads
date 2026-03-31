import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { embedEntity, companyToText } from "@/lib/embeddings";

const tamCompanySchema = z.object({
  companies: z.array(
    z.object({
      name: z.string().describe("Company name"),
      domain: z.string().nullable().describe("Website domain if known"),
      industry: z.string().describe("Primary industry"),
      size: z.string().describe("Employee count range (e.g. 11-50, 51-200, 201-500)"),
      revenue: z.string().describe("Estimated annual revenue range"),
      description: z.string().describe("1-2 sentence company description"),
      whyItFits: z.string().describe("Why this company matches the ICP"),
    })
  ),
});

const scoreSchema = z.object({
  score: z.number().min(0).max(100).describe("ICP fit score 0-100"),
  reasons: z.array(z.string()).describe("2-3 specific reasons for the score"),
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
    const { icp } = body;

    if (!icp || typeof icp !== "string" || icp.trim().length === 0) {
      return Response.json({ error: "ICP description required" }, { status: 400 });
    }

    // Get existing company names to avoid duplicates
    const existing = await db
      .select({ name: companies.name })
      .from(companies)
      .limit(200);
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

    // Generate companies matching ICP
    const { object } = await generateObject({
      model,
      schema: tamCompanySchema,
      prompt: `You are a B2B sales intelligence system. Generate a list of 30 REAL companies that match this Ideal Customer Profile (ICP):

"${icp.trim()}"

Requirements:
- Generate REAL companies that actually exist, not fictional ones
- Include a mix of well-known and lesser-known companies
- Each company should genuinely match the ICP criteria
- Provide accurate firmographic data based on what you know
- The "whyItFits" field should reference specific ICP criteria
- Do NOT include these companies (already in system): ${Array.from(existingNames).slice(0, 50).join(", ")}

Focus on companies that a founder doing outbound sales would actually want to target.`,
    });

    let created = 0;
    let skipped = 0;
    const newCompanyIds: string[] = [];

    for (const company of object.companies) {
      // Skip duplicates
      if (existingNames.has(company.name.toLowerCase())) {
        skipped++;
        continue;
      }

      try {
        const [inserted] = await db
          .insert(companies)
          .values({
            name: company.name,
            domain: company.domain,
            industry: company.industry,
            size: company.size,
            revenue: company.revenue,
            description: company.description,
            tenantId: "default",
            properties: {
              source: "tam",
              whyItFits: company.whyItFits,
              icpUsed: icp.trim(),
            },
          })
          .returning();

        newCompanyIds.push(inserted.id);
        existingNames.add(company.name.toLowerCase());
        created++;
      } catch (err) {
        console.warn(`Failed to insert TAM company ${company.name}:`, err);
        skipped++;
      }
    }

    // Score the new companies against ICP
    let scored = 0;
    for (const id of newCompanyIds) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, id))
          .limit(1);

        if (!company) continue;

        const { object: scoreResult } = await generateObject({
          model,
          schema: scoreSchema,
          prompt: `Score how well this company fits the ICP on a scale of 0-100.

ICP: "${icp.trim()}"

Company: ${company.name}
Industry: ${company.industry || "unknown"}
Size: ${company.size || "unknown"}
Revenue: ${company.revenue || "unknown"}
Description: ${company.description || "none"}

Score higher for companies that closely match the ICP criteria.`,
        });

        await db
          .update(companies)
          .set({
            score: scoreResult.score,
            scoreReasons: scoreResult.reasons,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, id));

        // Embed for semantic search
        const text = companyToText({
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          revenue: company.revenue,
          size: company.size,
          description: company.description,
        });
        if (text && process.env.OPENAI_API_KEY) {
          await embedEntity("default", "company", id, text).catch(console.warn);
        }

        scored++;
      } catch (err) {
        console.warn(`Failed to score TAM company ${id}:`, err);
      }
    }

    return Response.json({
      success: true,
      companiesCreated: created,
      companiesScored: scored,
      companiesSkipped: skipped,
    });
  } catch (error) {
    console.error("TAM generation failed:", error);
    return Response.json({ error: "TAM generation failed" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(companies);

    const tamResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(sql`properties->>'source' = 'tam'`);

    return Response.json({
      totalCompanies: Number(result[0]?.count || 0),
      tamCompanies: Number(tamResult[0]?.count || 0),
    });
  } catch (error) {
    console.error("TAM status failed:", error);
    return Response.json({ error: "Failed to get TAM status" }, { status: 500 });
  }
}
