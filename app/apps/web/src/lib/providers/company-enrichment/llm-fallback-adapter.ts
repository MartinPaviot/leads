import { enrichCompanyViaLLM } from "@/lib/llm-enrichment";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * LLM fallback — lowest priority (100). Used when structured providers
 * (Apollo, Clearbit, etc.) can't resolve the company. Quality is lower
 * than a real data broker; value is coverage (a founder with no Apollo
 * key still gets *something*).
 */
export const llmFallbackCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "llm-fallback",
  priority: 100,
  costCentsPerCall: 2, // Claude Sonnet ~2¢ for a short structured output call.
  isAvailable(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  },
  async enrich(input: EnrichInput, ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    const name = input.name?.trim();
    const domain = input.domain?.trim() || null;

    if (!name) {
      return {
        ok: false,
        data: null,
        error: "llm-fallback: name required",
        provider: "llm-fallback",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    let payload: Awaited<ReturnType<typeof enrichCompanyViaLLM>> = null;
    try {
      payload = await enrichCompanyViaLLM(name, domain, ctx.tenantId);
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        provider: "llm-fallback",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!payload) {
      return {
        ok: false,
        data: null,
        error: "llm-fallback: no data returned",
        provider: "llm-fallback",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const data: Partial<EnrichedCompany> = {
      domain,
      name,
      industry: payload.industry,
      description: payload.description,
      sizeRange: payload.size,
      revenueRange: payload.revenue,
      foundedYear: payload.founded_year,
      city: payload.city,
      country: payload.country,
      technologies: Array.isArray(payload.technologies) ? payload.technologies : [],
      keywords: Array.isArray(payload.keywords) ? payload.keywords : [],
      // LLM output doesn't carry employee count, LinkedIn, funding, or
      // logo. We leave those null so the waterfall can try additional
      // providers for them without this one blocking the chain.
      employeeCount: null,
      annualRevenue: null,
      state: null,
      fundingStage: null,
      totalFunding: null,
      linkedinUrl: null,
      logoUrl: null,
      raw: payload as unknown as Record<string, unknown>,
    };

    return {
      ok: true,
      data,
      provider: "llm-fallback",
      durationMs: Date.now() - startedAt,
      costCents: 2,
    };
  },
};
