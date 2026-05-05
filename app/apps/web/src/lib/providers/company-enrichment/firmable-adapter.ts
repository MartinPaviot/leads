import { enrichCompanyByDomain, isFirmableAvailable } from "@/lib/integrations/firmable-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * Firmable adapter — Australia/New Zealand specialist.
 * 1.5M companies, 10.2M contacts, ABN-verified, DNC-checked.
 * Gets priority boost for .au/.nz domains via geoAffinity.
 */
export const firmableCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "firmable",
  priority: 20,
  costCentsPerCall: 0,
  geoAffinity: ["AU"],
  isAvailable(): boolean {
    return isFirmableAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    if (!input.domain) {
      return {
        ok: false,
        data: null,
        error: "firmable-adapter: domain required",
        provider: "firmable",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    let org: Awaited<ReturnType<typeof enrichCompanyByDomain>> = null;
    try {
      org = await enrichCompanyByDomain(input.domain);
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        provider: "firmable",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!org) {
      return {
        ok: false,
        data: null,
        error: "firmable-adapter: no organization found",
        provider: "firmable",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const data: Partial<EnrichedCompany> = {
      domain: org.domain ?? input.domain,
      name: org.name ?? null,
      industry: org.industry ?? null,
      description: org.description ?? null,
      employeeCount: org.employeeCount ?? null,
      annualRevenue: org.revenue ?? null,
      foundedYear: org.foundedYear ?? null,
      city: org.city ?? null,
      state: org.state ?? null,
      country: org.country ?? null,
      technologies: org.technologies ?? [],
      linkedinUrl: org.linkedinUrl ?? null,
      raw: {
        ...(org as unknown as Record<string, unknown>),
        abn: org.abn,
      },
    };

    return {
      ok: true,
      data,
      provider: "firmable",
      durationMs: Date.now() - startedAt,
      costCents: 0,
    };
  },
};
