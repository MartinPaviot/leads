import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
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
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
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

        // Only generate signals from Apollo-verified data — not from LLM fallback
        if (props.enrichment_source !== "apollo") {
          continue;
        }

        // Claude INTERPRETS real facts into sales signals
        const { object } = await tracedGenerateObject({
          model,
          schema: signalInterpretationSchema,
          temperature: 0.2,
          prompt: `Analyze these VERIFIED FACTS about ${company.name} (${company.domain || "no domain"}) and identify buying signals relevant to B2B sales outreach.

VERIFIED FACTS (from Apollo.io enrichment):
${facts.map((f) => `- ${f}`).join("\n")}

<examples>
<example>
FACTS: Total funding: $12M Series A, Employee count: 45, Founded: 2021, Technologies: React, AWS
SIGNALS:
- type: "funding", title: "Recent Series A ($12M)", relevance: "high", reasoning: "Post-Series A companies typically invest in scaling infrastructure within 6 months", dataSource: "Total funding: $12M Series A"
- type: "hiring", title: "Fast-growing startup (45 employees, founded 2021)", relevance: "medium", reasoning: "Growing from 0 to 45 employees in 3 years indicates rapid scaling and likely process gaps", dataSource: "Employee count: 45, Founded: 2021"
</example>
<example>
FACTS: Industry: Financial Services, Employee count: 500, Technologies: Salesforce, HubSpot
SIGNALS:
- type: "tech_change", title: "Dual CRM stack (Salesforce + HubSpot)", relevance: "medium", reasoning: "Running two CRM systems often indicates a recent acquisition or department misalignment — both create tool consolidation opportunities", dataSource: "Technologies: Salesforce, HubSpot"
</example>
</examples>

RULES:
- ONLY generate signals based on the facts above — never invent information
- Each signal must reference which fact it's based on (in dataSource field)
- Focus on signals that indicate buying intent, budget availability, or good timing
- If the facts don't support a signal type, skip it — return fewer signals rather than invented ones
- Think about WHY each fact is a signal: what does it imply about the company's needs RIGHT NOW?

Return only signals you can directly support with the facts provided.`,
          providerOptions: {
            anthropic: {
              thinking: { type: "enabled", budgetTokens: 3000 },
              cacheControl: { type: "ephemeral" },
            },
          },
          _trace: { agentId: "detect-signals", tenantId: authCtx.tenantId, inputPreview: `Signals for ${company.name}` },
        });
        const result = object as any;

        await db
          .update(companies)
          .set({
            properties: {
              ...props,
              signals: result.signals.map((s: any) => ({
                ...s,
                detectedAt: new Date().toISOString(),
                source: "apollo_enrichment",
              })),
            },
            updatedAt: new Date(),
          })
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));

        if (result.signals.length > 0) detected++;
        totalSignals += result.signals.length;
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
