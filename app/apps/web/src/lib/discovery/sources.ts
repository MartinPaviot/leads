/**
 * Default discovery-source adapters. Each wraps an existing integration
 * client + its ICP→params translator and normalizes results into
 * DiscoveredCandidate. Adding a source = a new adapter here, registered
 * in registry.ts — no change to the living-TAM loop.
 */
import type { DiscoverySource, DiscoveredCandidate } from "./types";
import {
  searchOrganizations,
  isApolloAvailable,
} from "@/lib/integrations/apollo-client";
import {
  searchCompaniesPappers,
  isPappersAvailable,
} from "@/lib/integrations/pappers-client";
import {
  searchCompaniesSirene,
  isSireneAvailable,
} from "@/lib/integrations/recherche-entreprises-client";
import { icpToStrategy } from "@/lib/icp/icp-to-tam";
import { criteriaToPappersParams } from "@/lib/icp/to-pappers-params";
import { criteriaToSireneParams } from "@/lib/icp/to-sirene-params";
import { normalizeDomain } from "@/lib/tam/candidate";

/** Apollo — broad global firmographics. The current sole source. */
export const apolloDiscoverySource: DiscoverySource = {
  name: "apollo",
  priority: 10,
  costCentsPerCall: 0,
  isAvailable: isApolloAvailable,
  async search(q): Promise<DiscoveredCandidate[]> {
    const strategy = icpToStrategy(q.icpName, q.criteria);
    if (!strategy) return [];
    const res = await searchOrganizations({
      ...strategy.filters,
      page: 1,
      per_page: q.limit,
    });
    return (res.organizations ?? []).map((o) => ({
      sourceName: "apollo",
      name: o.name ?? null,
      domain: normalizeDomain(o.primary_domain ?? o.website_url ?? null),
      nativeId: o.id ?? null,
      nativeIdType: "apollo",
      industry: o.industry ?? null,
      employeeCount: o.estimated_num_employees ?? null,
      country: o.country ?? null,
      raw: o as unknown as Record<string, unknown>,
    }));
  },
};

/** Pappers — French registry (SIRENE/INPI/BODACC). Exhaustive FR coverage
 * with precise NAF sector + a real domain. Self-skips for non-French ICPs
 * (criteriaToPappersParams → ok:false). Key-gated (PAPPERS_API_KEY). */
export const pappersDiscoverySource: DiscoverySource = {
  name: "pappers",
  priority: 20,
  costCentsPerCall: 0, // free tier (100 req/mo)
  geoAffinity: ["FR"],
  isAvailable: isPappersAvailable,
  async search(q): Promise<DiscoveredCandidate[]> {
    const t = criteriaToPappersParams(q.criteria);
    if (!t.ok) return []; // non-French ICP — Apollo/Zefix handle it
    const res = await searchCompaniesPappers({
      ...t.params,
      page: 1,
      perPage: q.limit,
    });
    // Only candidates that already carry a domain — the insert/enrich flow
    // is domain-keyed. Domainless FR cos wait for the resolution bridge.
    return res.companies
      .filter((c) => c.website)
      .map((c) => ({
        sourceName: "pappers",
        name: c.name,
        domain: c.website,
        nativeId: c.siren || null,
        nativeIdType: "siren",
        industry: c.libelleNaf ?? c.codeNaf ?? null,
        employeeCount: null,
        country: "France",
        raw: c as unknown as Record<string, unknown>,
      }));
  },
};

/** SIRENE (recherche-entreprises) — KEYLESS, exhaustive French registry,
 * sector-driven (NAF). Yields DOMAINLESS candidates (SIRENE has no
 * website); the domain-resolution bridge fills the domain at apply time
 * (Pappers fiche-by-SIREN). Self-skips non-French / non-NAF-mappable ICPs. */
export const sireneDiscoverySource: DiscoverySource = {
  name: "sirene",
  priority: 30,
  costCentsPerCall: 0,
  geoAffinity: ["FR"],
  isAvailable: isSireneAvailable, // keyless → always available
  async search(q): Promise<DiscoveredCandidate[]> {
    const t = criteriaToSireneParams(q.criteria);
    if (!t.ok) return [];
    const res = await searchCompaniesSirene({ ...t.params, perPage: 25 });
    return res.companies.map((c) => ({
      sourceName: "sirene",
      name: c.name,
      domain: null,
      nativeId: c.siren,
      nativeIdType: "siren",
      industry: c.libelleNaf ?? c.naf ?? null,
      employeeCount: null,
      country: "France",
      raw: c as unknown as Record<string, unknown>,
    }));
  },
};
