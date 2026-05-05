import {
  enrichOrganization,
  isCrunchbaseAvailable,
} from "@/lib/integrations/crunchbase-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

function parseFoundedYear(date: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1800 ? year : null;
}

function parseEmployeeEnum(enumVal: string | null): number | null {
  if (!enumVal) return null;
  // Crunchbase returns ranges like "c_00051_00100", "c_00101_00250"
  const match = enumVal.match(/c_(\d+)_(\d+)/);
  if (match) return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
  // Single-bound like "c_10001_max"
  const singleMatch = enumVal.match(/c_(\d+)_max/);
  if (singleMatch) return parseInt(singleMatch[1]);
  return null;
}

export const crunchbaseCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "crunchbase",
  priority: 20,
  costCentsPerCall: 0,
  isAvailable(): boolean {
    return isCrunchbaseAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    if (!input.domain) {
      return {
        ok: false,
        data: null,
        error: "crunchbase-adapter: domain required",
        provider: "crunchbase",
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
        provider: "crunchbase",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!org) {
      return {
        ok: false,
        data: null,
        error: "crunchbase-adapter: no organization found",
        provider: "crunchbase",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const city = org.location_identifiers.find((l) => l.location_type === "city")?.value ?? null;
    const country = org.location_identifiers.find((l) => l.location_type === "country")?.value ?? null;

    const data: Partial<EnrichedCompany> = {
      name: org.name ?? null,
      description: org.short_description ?? null,
      industry: org.categories.length > 0 ? org.categories[0] : null,
      keywords: org.categories,
      foundedYear: parseFoundedYear(org.founded_on),
      employeeCount: parseEmployeeEnum(org.num_employees_enum),
      fundingStage: org.last_funding_type ?? null,
      totalFunding: org.funding_total?.value ?? null,
      city,
      country,
      investors: org.investor_identifiers.map((i) => i.value),
      raw: {
        permalink: org.permalink,
        last_funding_at: org.last_funding_at,
        investor_identifiers: org.investor_identifiers,
        funding_total: org.funding_total,
        num_employees_enum: org.num_employees_enum,
        categories: org.categories,
        location_identifiers: org.location_identifiers,
      },
    };

    return {
      ok: true,
      data,
      provider: "crunchbase",
      durationMs: Date.now() - startedAt,
      costCents: 0,
    };
  },
};
