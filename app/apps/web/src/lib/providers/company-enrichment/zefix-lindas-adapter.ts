import { enrichSwissCompanyByNameLindas, isZefixLindasAvailable } from "@/lib/integrations/zefix-lindas-client";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * Zefix via LINDAS — KEYLESS Swiss commercial-registry enrichment (no
 * account / password). Fills the gap for Swiss companies (the romand ICP
 * core) that Apollo misses without a domain: the official **purpose**
 * (description) + country. It carries no headcount/revenue (Zefix has
 * neither), but the purpose text lets the LLM fallback derive the sector.
 *
 * Priority 16 — after Apollo (10) and SIRENE (15, France). Matches on an
 * EXACT legal name, so a foreign namesake is never enriched as Swiss.
 */
export const zefixLindasCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "zefix-lindas",
  priority: 16,
  costCentsPerCall: 0, // keyless / free
  geoAffinity: ["EU"], // .ch domains are detected as EU
  isAvailable(): boolean {
    return isZefixLindasAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();
    const name = input.name?.trim();
    if (!name) {
      return { ok: false, data: null, error: "zefix-lindas: name required", provider: "zefix-lindas", durationMs: Date.now() - startedAt, costCents: 0 };
    }

    let hit: Awaited<ReturnType<typeof enrichSwissCompanyByNameLindas>> = null;
    try {
      hit = await enrichSwissCompanyByNameLindas(name);
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), provider: "zefix-lindas", durationMs: Date.now() - startedAt, costCents: 0 };
    }

    // The client filters on an exact legal-name match, so any hit is trusted.
    if (!hit) {
      return { ok: false, data: null, error: "zefix-lindas: no exact match", provider: "zefix-lindas", durationMs: Date.now() - startedAt, costCents: 0 };
    }

    const data: Partial<EnrichedCompany> = {
      name: hit.name,
      description: hit.description,
      country: "Switzerland",
      raw: hit as unknown as Record<string, unknown>,
    };

    return { ok: true, data, provider: "zefix-lindas", durationMs: Date.now() - startedAt, costCents: 0 };
  },
};
