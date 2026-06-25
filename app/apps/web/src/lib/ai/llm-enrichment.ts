/**
 * LLM-based company enrichment fallback.
 *
 * When Apollo API is unavailable (no key, free plan, rate limited),
 * this module uses an LLM to extract company information from the
 * company's website + publicly available data.
 *
 * Lower quality than Apollo but better than nothing — at least gives
 * the user industry, description, and rough size estimates.
 */

import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const companyEnrichSchema = z.object({
  industry: z.string().nullable(),
  description: z.string().nullable(),
  size: z.string().nullable(),
  revenue: z.string().nullable(),
  founded_year: z.number().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  technologies: z.array(z.string()),
  keywords: z.array(z.string()),
});

export type LLMCompanyEnrichment = z.infer<typeof companyEnrichSchema>;

/**
 * Enrich a company using LLM knowledge when Apollo is unavailable.
 * Uses the company name + domain as input. Returns null if LLM is
 * not configured.
 */
export async function enrichCompanyViaLLM(
  name: string,
  domain: string | null,
  tenantId: string,
): Promise<LLMCompanyEnrichment | null> {
  const model = getLLMModel();
  if (!model) return null;

  try {
    const result = await tracedGenerateObject({
      model,
      schema: companyEnrichSchema,
      prompt: `You are a business intelligence analyst. Based on your knowledge, provide information about this company. Only include facts you are confident about — return null for uncertain fields.

Company: ${name}
${domain ? `Website: ${domain}` : ""}

Return:
- industry: The company's primary industry (e.g., "SaaS", "Healthcare", "Fintech")
- description: 1-2 sentence description of what the company does
- size: Employee count range (e.g., "11-50", "51-200", "201-500")
- revenue: Revenue range estimate (e.g., "$1M-$10M", "$10M-$50M") or null if unknown
- founded_year: Year founded or null
- city: HQ city or null
- country: HQ country or null
- technologies: Known tech stack (frameworks, languages, cloud providers)
- keywords: 3-5 business keywords

Be conservative — return null for anything you're not confident about. Do not hallucinate.`,
      _trace: {
        agentId: "llm-enrichment-fallback",
        tenantId,
      },
    });

    return result.object;
  } catch (err) {
    console.warn("llm-enrichment: failed for", name, err);
    return null;
  }
}
