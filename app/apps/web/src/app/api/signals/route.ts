import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const signalInterpretationSchema = z.object({
  signals: z.array(
    z.object({
      type: z.enum(["hiring", "funding", "tech_change", "news", "expansion", "leadership_change"]),
      title: z.string(),
      description: z.string(),
      relevance: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
      dataSource: z.string().describe("Which Apollo data point this signal is based on"),
    })
  ),
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

    let detected = 0;
    let totalSignals = 0;

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, id))
          .limit(1);

        if (!company) continue;

        const props = (company.properties || {}) as Record<string, unknown>;

        // Build facts from Apollo enrichment data
        const facts: string[] = [];

        if (props.total_funding) facts.push(`Total funding: ${props.total_funding_printed || props.total_funding}`);
        if (props.latest_funding_stage) facts.push(`Latest funding stage: ${props.latest_funding_stage}`);
        if (props.technologies && Array.isArray(props.technologies) && props.technologies.length > 0) {
          facts.push(`Technology stack: ${(props.technologies as string[]).join(", ")}`);
        }
        if (props.employee_count) facts.push(`Employee count: ${props.employee_count}`);
        if (props.founded_year) facts.push(`Founded: ${props.founded_year}`);
        if (props.city && props.country) facts.push(`HQ: ${props.city}, ${props.state || ""} ${props.country}`);
        if (props.keywords && Array.isArray(props.keywords)) {
          facts.push(`Keywords: ${(props.keywords as string[]).slice(0, 10).join(", ")}`);
        }
        if (company.industry) facts.push(`Industry: ${company.industry}`);
        if (company.size) facts.push(`Size: ${company.size}`);
        if (company.revenue) facts.push(`Revenue: ${company.revenue}`);

        if (facts.length === 0) {
          // No enrichment data — can't generate meaningful signals
          continue;
        }

        // Claude INTERPRETS real facts into sales signals
        const { object } = await generateObject({
          model,
          schema: signalInterpretationSchema,
          prompt: `Analyze these VERIFIED FACTS about ${company.name} (${company.domain || "no domain"}) and identify buying signals relevant to B2B sales outreach.

VERIFIED FACTS (from Apollo.io enrichment):
${facts.map((f) => `- ${f}`).join("\n")}

RULES:
- ONLY generate signals based on the facts above
- Do NOT invent any information not in the facts
- Each signal must reference which fact it's based on (in dataSource)
- Focus on signals that indicate buying intent, budget availability, or good timing
- Example: "Total funding: $12M Series A" → signal "Recent funding suggests budget for new tools"
- If the facts don't support a signal type, skip it — return fewer signals rather than invented ones

Return only signals you can directly support with the facts provided.`,
        });

        await db
          .update(companies)
          .set({
            properties: {
              ...props,
              signals: object.signals.map((s) => ({
                ...s,
                detectedAt: new Date().toISOString(),
                source: "apollo_enrichment",
              })),
            },
            updatedAt: new Date(),
          })
          .where(eq(companies.id, id));

        if (object.signals.length > 0) detected++;
        totalSignals += object.signals.length;
      } catch (err) {
        console.warn(`Failed to detect signals for company ${id}:`, err);
      }
    }

    return Response.json({ success: true, detected, totalSignals });
  } catch (error) {
    console.error("Signal detection failed:", error);
    return Response.json({ error: "Signal detection failed" }, { status: 500 });
  }
}
