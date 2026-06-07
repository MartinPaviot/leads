/**
 * Domain-resolution bridge — the piece that lets a domainless authoritative
 * registry (SIRENE) feed the domain-keyed insert/enrich flow.
 *
 * Tries resolvers in order: an already-present domain, then Pappers
 * fiche-by-SIREN (key-gated). Extensible — a name→domain search resolver
 * plugs in here later. Returns null when nothing resolves (the candidate
 * is then inserted identity-only, with its SIREN, until a resolver fills
 * the domain).
 */
import {
  isPappersAvailable,
  companyDomainBySirenPappers,
} from "@/lib/integrations/pappers-client";
import { normalizeDomain } from "@/lib/tam/candidate";

export interface ResolvableIdentity {
  domain?: string | null;
  siren?: string | null;
}

export async function resolveDomain(
  id: ResolvableIdentity,
): Promise<string | null> {
  if (id.domain) return normalizeDomain(id.domain);

  if (id.siren && isPappersAvailable()) {
    try {
      const d = await companyDomainBySirenPappers(id.siren);
      if (d) return normalizeDomain(d);
    } catch {
      // best-effort — fall through to unresolved
    }
  }

  return null;
}
