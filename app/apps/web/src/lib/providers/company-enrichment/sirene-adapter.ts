import { enrichCompanyByNameSirene, isSireneAvailable } from "@/lib/integrations/recherche-entreprises-client";
import { trancheToSizeRange } from "@/lib/integrations/pappers-codes";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  EnrichResult,
  EnrichedCompany,
  ProviderContext,
} from "./types";

/**
 * Official INSEE NAF rev.2 sections (A..U) — the canonical 21-entry
 * nomenclature, NOT a fuzzy synonym list. Used to turn SIRENE's NAF code
 * into a readable, group-able industry label.
 */
const NAF_SECTION_LABELS: Record<string, string> = {
  A: "Agriculture, sylviculture et pêche",
  B: "Industries extractives",
  C: "Industrie manufacturière",
  D: "Production et distribution d'électricité et de gaz",
  E: "Eau, assainissement, gestion des déchets",
  F: "Construction",
  G: "Commerce, réparation d'automobiles",
  H: "Transports et entreposage",
  I: "Hébergement et restauration",
  J: "Information et communication",
  K: "Activités financières et d'assurance",
  L: "Activités immobilières",
  M: "Activités spécialisées, scientifiques et techniques",
  N: "Activités de services administratifs et de soutien",
  O: "Administration publique",
  P: "Enseignement",
  Q: "Santé humaine et action sociale",
  R: "Arts, spectacles et activités récréatives",
  S: "Autres activités de services",
  T: "Activités des ménages en tant qu'employeurs",
  U: "Activités extra-territoriales",
};

/**
 * SIRENE (recherche-entreprises.api.gouv.fr) — KEYLESS, free, authoritative
 * French firmographics by NAME. Fills the gap Apollo can't: a French
 * company with no domain (Apollo's enrich requires a domain) still gets
 * industry / size / revenue / location from the official registry.
 *
 * Runs at priority 15 (right after Apollo) so it catches domainless /
 * Apollo-miss companies before the key-gated EU brokers. Trusts a result
 * only on an EXACT legal-name match, so a US namesake can't be enriched
 * with a French company's data.
 */
export const sireneCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "sirene",
  priority: 15,
  costCentsPerCall: 0, // keyless / free
  geoAffinity: ["EU"],
  isAvailable(): boolean {
    return isSireneAvailable();
  },
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const startedAt = Date.now();
    const name = input.name?.trim();
    if (!name) {
      return { ok: false, data: null, error: "sirene-adapter: name required", provider: "sirene", durationMs: Date.now() - startedAt, costCents: 0 };
    }

    let hit: Awaited<ReturnType<typeof enrichCompanyByNameSirene>> = null;
    try {
      hit = await enrichCompanyByNameSirene(name);
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), provider: "sirene", durationMs: Date.now() - startedAt, costCents: 0 };
    }

    if (!hit || !hit.exact) {
      return {
        ok: false,
        data: null,
        error: hit ? "sirene-adapter: no exact name match" : "sirene-adapter: not found",
        provider: "sirene",
        durationMs: Date.now() - startedAt,
        costCents: 0,
      };
    }

    const industry = (hit.section ? NAF_SECTION_LABELS[hit.section] : null) ?? hit.naf ?? null;
    const data: Partial<EnrichedCompany> = {
      name: hit.name,
      industry,
      sizeRange: trancheToSizeRange(hit.effectifTranche),
      annualRevenue: hit.ca,
      foundedYear: hit.foundedYear,
      city: hit.city,
      country: "France",
      raw: hit as unknown as Record<string, unknown>,
    };

    return { ok: true, data, provider: "sirene", durationMs: Date.now() - startedAt, costCents: 0 };
  },
};
