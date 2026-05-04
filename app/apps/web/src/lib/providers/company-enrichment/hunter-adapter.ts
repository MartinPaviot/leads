import { searchDomain, isHunterAvailable } from "@/lib/hunter-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * Hunter.io enrichment adapter. Hunter is primarily an email-finding
 * tool; the company-level data it returns is limited (organization
 * name, location, email pattern). Its real value flows downstream
 * when the contact-finding pipeline uses the stored domain search
 * result for email discovery and verification.
 */
export const hunterCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "hunter",
  priority: 30,
  costCentsPerCall: 0,
  isAvailable(): boolean {
    return isHunterAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();

    if (!input.domain) {
      return {
        ok: false,
        data: null,
        error: "hunter-adapter: domain required",
        provider: "hunter",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    let result: Awaited<ReturnType<typeof searchDomain>> = null;
    try {
      result = await searchDomain(input.domain);
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        provider: "hunter",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    if (!result) {
      return {
        ok: false,
        data: null,
        error: "hunter-adapter: no results",
        provider: "hunter",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const data: Partial<EnrichedCompany> = {
      domain: result.domain,
      name: result.organization ?? null,
      city: result.city ?? null,
      state: result.state ?? null,
      country: result.country ?? null,
      raw: {
        pattern: result.pattern,
        emailCount: result.emails.length,
        emails: result.emails.map((e) => ({
          value: e.value,
          confidence: e.confidence,
          type: e.type,
          position: e.position,
          seniority: e.seniority,
        })),
      },
    };

    return {
      ok: true,
      data,
      provider: "hunter",
      durationMs: Date.now() - startedAt,
      costCents: 0,
    };
  },
};
