/**
 * POST /api/icp/parse-nl
 *
 * Apollo-style persona search in natural language. Turns a free-text
 * description of WHO to reach ("VP Eng and CTOs at Series-B fintech in France,
 * 50-200 employees, using AWS") into the structured ICP / persona filters that
 * /api/tam/estimate (live count) and the TAM build path consume — plus a
 * human-readable summary so the user can confirm what was understood.
 *
 * This is discovery (find NEW accounts/people via Apollo), distinct from
 * /api/filters/parse-nl which filters the accounts already in the CRM.
 *
 * Body:   { query: string }
 * Returns { icp: {...structured filters}, summary, reasoning }
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const icpSchema = z.object({
  industries: z.array(z.string()).describe("Sector keywords, e.g. fintech, healthcare, SaaS, manufacturing"),
  keywords: z.array(z.string()).describe("Other free-text company keywords not covered by industries"),
  companySizes: z.array(z.string()).describe('Employee-count ranges as "min-max", e.g. "11-50","51-200","201-500","501-1000","1001-5000". Use "10001+" for the top band.'),
  geographies: z.array(z.string()).describe('Locations to include (countries, regions, cities), e.g. "France","Suisse romande","Geneva","DACH"'),
  excludeGeographies: z.array(z.string()).describe("Locations to exclude"),
  technologies: z.array(z.string()).describe("Technologies the company must use, e.g. AWS, Salesforce, Shopify"),
  revenueMin: z.number().nullable().describe("Min annual revenue in USD, or null"),
  revenueMax: z.number().nullable().describe("Max annual revenue in USD, or null"),
  fundingRecencyDays: z.number().nullable().describe("Only companies funded within the last N days, or null"),
  titles: z.array(z.string()).describe('Target job titles (the persona), e.g. "VP Engineering","CTO","Head of Sales"'),
  seniorities: z.array(z.string()).describe('Seniority bands, e.g. "c_suite","vp","head","director","manager","owner"'),
  summary: z.string().describe("One short human sentence restating the audience, for the user to confirm."),
  reasoning: z.string().describe("One sentence on what was inferred vs. stated."),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as { query?: unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ error: "query (non-empty string) required" }, { status: 400 });
  if (query.length > 600) return Response.json({ error: "query too long (max 600 chars)" }, { status: 400 });

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return Response.json({ error: "No LLM API key configured" }, { status: 500 });

  const prompt = `You translate a salesperson's natural-language description of their target audience into a structured prospecting persona for an Apollo-style company + people search.

Description: "${query}"

Extract:
- industries / keywords: the sector(s) and any descriptive company keywords (e.g. "Series-B" -> keyword "series b").
- companySizes: employee-count ranges as "min-max" (e.g. "50-200 employees" -> "51-200"; "mid-market" -> "201-1000"; "SMB" -> "11-200"; "enterprise" -> "1001-5000"). Only if the size is stated or clearly implied.
- geographies / excludeGeographies: places to include / exclude. Keep them as the user said them ("France", "Suisse romande", "Geneva", "DACH", "US").
- technologies: only if a tool/stack is named.
- revenueMin/Max (USD), fundingRecencyDays: only if stated ("recently funded" -> ~180 days).
- titles + seniorities: the PERSONA — who to actually call. Map roles to titles ("VP Eng" -> "VP Engineering") and seniority bands (c_suite, vp, head, director, manager, owner). "decision makers" -> seniorities [c_suite, vp, head, director].
- summary: restate the audience in one plain sentence for the user to confirm.

Only fill a field when the description states or clearly implies it; otherwise use an empty array or null. Do not invent geographies or sizes that weren't mentioned.`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: icpSchema,
      prompt,
      _trace: { agentId: "icp-persona-parse", tenantId: authCtx.tenantId, inputPreview: query.slice(0, 120) },
    });
    const icp = object as z.infer<typeof icpSchema>;
    return Response.json({
      icp: {
        industries: icp.industries ?? [],
        keywords: icp.keywords ?? [],
        companySizes: icp.companySizes ?? [],
        geographies: icp.geographies ?? [],
        excludeGeographies: icp.excludeGeographies ?? [],
        technologies: icp.technologies ?? [],
        revenueMin: icp.revenueMin ?? null,
        revenueMax: icp.revenueMax ?? null,
        fundingRecencyDays: icp.fundingRecencyDays ?? null,
        titles: icp.titles ?? [],
        seniorities: icp.seniorities ?? [],
      },
      summary: icp.summary ?? "",
      reasoning: icp.reasoning ?? "",
    });
  } catch (err) {
    console.warn("icp/parse-nl failed", err);
    return Response.json({ error: "Failed to parse the audience", detail: String(err).slice(0, 200) }, { status: 500 });
  }
}
