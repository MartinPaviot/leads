import { enrichOrganization, isApolloAvailable } from "@/lib/integrations/apollo-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * Try to pull a bare domain out of a free-form website URL.
 * Apollo's enrich payload uses `website_url` which may include
 * scheme + path — callers persist a bare domain.
 */
function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./i, "") || null;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || null;
  }
}

export const apolloCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "apollo",
  priority: 10,
  costCentsPerCall: 0, // Apollo is on our monthly plan — per-call marginal cost is ~0.
  isAvailable(): boolean {
    return isApolloAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    // Apollo's enrich endpoint matches on domain. If we only have a
    // name, we can't call this provider — punt and let the next one
    // handle name-only input.
    if (!input.domain) {
      return {
        ok: false,
        data: null,
        error: "apollo-adapter: domain required",
        provider: "apollo",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    let org: Awaited<ReturnType<typeof enrichOrganization>> = null;
    try {
      org = await enrichOrganization(input.domain);
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        provider: "apollo",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!org) {
      return {
        ok: false,
        data: null,
        error: "apollo-adapter: no organization found",
        provider: "apollo",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const data: Partial<EnrichedCompany> = {
      domain: domainFromUrl(org.website_url) ?? input.domain ?? null,
      name: org.name ?? null,
      industry: org.industry ?? null,
      description: org.description ?? null,
      employeeCount: org.estimated_num_employees ?? null,
      annualRevenue: org.annual_revenue ?? null,
      revenueRange: org.annual_revenue_printed ?? null,
      foundedYear: org.founded_year ?? null,
      city: org.city ?? null,
      state: org.state ?? null,
      country: org.country ?? null,
      technologies: Array.isArray(org.technology_names) ? org.technology_names : [],
      keywords: Array.isArray(org.keywords) ? org.keywords : [],
      fundingStage: org.latest_funding_stage ?? null,
      totalFunding: org.total_funding ?? null,
      linkedinUrl: org.linkedin_url ?? null,
      // Apollo enrich doesn't return logo or a size-range bucket on this
      // endpoint — leave null and let downstream compute a sizeRange
      // from employeeCount when needed.
      logoUrl: null,
      sizeRange: null,
      raw: org as unknown as Record<string, unknown>,
    };

    return {
      ok: true,
      data,
      provider: "apollo",
      durationMs: Date.now() - startedAt,
      costCents: 0,
    };
  },
};
