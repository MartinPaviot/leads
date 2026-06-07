/**
 * Discovery-source contracts — the sourcing twin of the enrichment
 * provider registry (lib/providers/*-enrichment). One normalized
 * candidate shape every source yields, and a small source interface
 * (isAvailable + search). The living-TAM loop fans out across the
 * registered sources and turns candidates into add-proposals.
 *
 * Design: _specs/tam-lifecycle/office-hours.md §5.
 */
import type { Criterion } from "@/lib/icp/criteria-engine";
import { employeeCountToRange } from "@/lib/integrations/apollo-client";

export type DiscoveryGeo = "FR" | "CH" | "US" | "EU" | "OTHER";

/** A normalized company candidate from any source. `domain` may be null
 * (e.g. SIRENE) — such candidates need the domain-resolution bridge
 * before they can enter the domain-keyed insert/enrich flow. */
export interface DiscoveredCandidate {
  sourceName: string;
  name: string | null;
  domain: string | null;
  nativeId: string | null; // apollo id, SIREN, Zefix UID…
  nativeIdType: string | null; // "apollo" | "siren" | "zefix_uid"
  industry: string | null;
  employeeCount: number | null;
  country: string | null;
  raw?: Record<string, unknown>;
}

export interface DiscoveryQuery {
  tenantId: string;
  icpName: string;
  criteria: Criterion[];
  limit: number;
}

export interface DiscoverySource {
  /** Short slug, e.g. "apollo", "pappers", "sirene". */
  name: string;
  /** Lower runs first (10 broad/cheap, 20 regional specialist, …). */
  priority: number;
  /** False when config (env keys) is missing → the registry skips it. */
  isAvailable(): boolean;
  /** Estimated $ cost per call in US cents. 0 for flat/free tiers. */
  costCentsPerCall: number;
  /** Regions this source is strongest in (telemetry / future routing). */
  geoAffinity?: DiscoveryGeo[];
  /** Return [] (never throw) when the source can't serve this query
   * (e.g. Pappers for a non-French ICP). */
  search(query: DiscoveryQuery): Promise<DiscoveredCandidate[]>;
}

/** Map a candidate into the `add` proposal payload applyProposal() inserts
 * on approval. Source-agnostic so every source funnels through one shape. */
export function candidateToAddPayload(
  c: DiscoveredCandidate,
): Record<string, unknown> {
  const idKey = `${c.nativeIdType ?? "native"}_id`;
  return {
    name: c.name ?? c.domain ?? "Unknown",
    domain: c.domain,
    industry: c.industry,
    size: c.employeeCount ? employeeCountToRange(c.employeeCount) : null,
    // Top-level siren so applyProposal can resolve a domain at approval
    // time for domainless registry candidates (SIRENE).
    ...(c.nativeIdType === "siren" && c.nativeId ? { siren: c.nativeId } : {}),
    source: c.sourceName,
    properties: {
      [idKey]: c.nativeId,
      native_ids: c.nativeId
        ? { [c.nativeIdType ?? "native"]: c.nativeId }
        : {},
      country: c.country,
      ...(typeof c.raw?.logo_url === "string"
        ? { logo_url: c.raw.logo_url }
        : {}),
    },
  };
}
