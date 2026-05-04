import { enrichCompanyByDomain, isDatagmaAvailable } from "@/lib/datagma-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

function parseHQ(hq: string | null): { city: string | null; country: string | null } {
  if (!hq) return { city: null, country: null };
  const parts = hq.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { city: parts[0], country: parts[parts.length - 1] };
  return { city: null, country: parts[0] };
}

function parseFunding(raw: string | null): { stage: string | null; total: number | null } {
  if (!raw) return { stage: null, total: null };
  const stageMatch = raw.match(/Series [A-Z]|Seed|Pre-Seed|IPO|Grant|Debt/i);
  const amountMatch = raw.match(/\$?([\d,.]+)\s*(M|B|K)?/i);
  let total: number | null = null;
  if (amountMatch) {
    const num = parseFloat(amountMatch[1].replace(/,/g, ""));
    const unit = (amountMatch[2] || "").toUpperCase();
    if (unit === "B") total = num * 1_000_000_000;
    else if (unit === "M") total = num * 1_000_000;
    else if (unit === "K") total = num * 1_000;
    else total = num;
  }
  return { stage: stageMatch?.[0] ?? null, total };
}

export const datagmaCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "datagma",
  priority: 20,
  costCentsPerCall: 1,
  geoAffinity: ["EU"],
  isAvailable(): boolean {
    return isDatagmaAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    if (!input.domain) {
      return {
        ok: false,
        data: null,
        error: "datagma-adapter: domain required",
        provider: "datagma",
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
        provider: "datagma",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!org) {
      return {
        ok: false,
        data: null,
        error: "datagma-adapter: no organization found",
        provider: "datagma",
        durationMs: Date.now() - startedAt,
        costCents: 1,
      };
    }

    const hq = parseHQ(org.companyHQ);
    const funding = parseFunding(org.companyFunding);

    const data: Partial<EnrichedCompany> = {
      domain: org.companyDomain ?? input.domain,
      name: org.companyName ?? null,
      industry: org.companyIndustry ?? null,
      description: org.companyDescription ?? null,
      employeeCount: org.companyExactEmployees ?? null,
      sizeRange: org.companySize ?? null,
      annualRevenue: org.companyRevenue ?? null,
      foundedYear: org.companyFounded ?? null,
      city: hq.city,
      country: hq.country,
      technologies: org.companyTechStack ?? [],
      keywords: org.companyTags ?? [],
      fundingStage: funding.stage,
      totalFunding: funding.total,
      linkedinUrl: org.companyLinkedinUrl ?? null,
      raw: org as unknown as Record<string, unknown>,
    };

    return {
      ok: true,
      data,
      provider: "datagma",
      durationMs: Date.now() - startedAt,
      costCents: 1,
    };
  },
};
