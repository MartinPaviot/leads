/**
 * Company-enrichment provider contracts.
 *
 * One normalized shape callers bind to (EnrichedCompany) and a small
 * provider interface (isAvailable + enrich). Waterfall orchestration,
 * registry, and adapters live in sibling files.
 *
 * Design: /_specs/PROVIDER-ABSTRACTION/design.md
 */

export interface EnrichedCompany {
  domain: string | null;
  name: string | null;
  industry: string | null;
  description: string | null;
  employeeCount: number | null;
  sizeRange: string | null;
  annualRevenue: number | null;
  revenueRange: string | null;
  foundedYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  technologies: string[];
  keywords: string[];
  fundingStage: string | null;
  totalFunding: number | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  /** Raw provider payload for forensic debugging — never rendered to users. */
  raw: Record<string, unknown> | null;
}

export function emptyCompany(): EnrichedCompany {
  return {
    domain: null,
    name: null,
    industry: null,
    description: null,
    employeeCount: null,
    sizeRange: null,
    annualRevenue: null,
    revenueRange: null,
    foundedYear: null,
    city: null,
    state: null,
    country: null,
    technologies: [],
    keywords: [],
    fundingStage: null,
    totalFunding: null,
    linkedinUrl: null,
    logoUrl: null,
    raw: null,
  };
}

export interface EnrichInput {
  domain?: string;
  name?: string;
  linkedinUrl?: string;
}

export interface ProviderContext {
  tenantId: string;
}

export interface EnrichResult {
  ok: boolean;
  data: Partial<EnrichedCompany> | null;
  error?: string;
  provider: string;
  durationMs: number;
  costCents: number;
}

export interface CompanyEnrichmentProvider {
  /** Short slug, e.g. "apollo", "llm-fallback", "clearbit". */
  name: string;
  /**
   * Lower runs first. Use 10 (fastest/cheapest/best), 50 (secondary),
   * 100 (LLM last resort). Gaps leave room for future providers.
   */
  priority: number;
  /** Return false when config (env keys) is missing so waterfall skips silently. */
  isAvailable(): boolean;
  /** Estimated $ cost per call in US cents. 0 for providers with flat subscriptions. */
  costCentsPerCall: number;
  enrich(input: EnrichInput, ctx: ProviderContext): Promise<EnrichResult>;
}

export interface ProvenanceEntry {
  provider: string;
  field: keyof EnrichedCompany;
  atIso: string;
}

export interface WaterfallResult {
  data: EnrichedCompany;
  provenance: ProvenanceEntry[];
  attempts: EnrichResult[];
  totalCostCents: number;
  /** True when at least one provider contributed a non-empty field. */
  enriched: boolean;
}
