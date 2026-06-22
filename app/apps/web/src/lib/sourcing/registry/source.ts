/**
 * Registry sourcing + field-level enrich (spec 06, AC1/AC2/AC4/AC5). FR bulk
 * sourcing paginates SIRENE (keyless) into canonical accounts keyed by legal_id;
 * enrichFromRegistry resolves a single entity by legal_id, cache-first, so spec
 * 08 can use a registry as a waterfall provider. Every call is metered (AC4).
 * (Zefix has no sector/headcount filter, so CH is enrich-by-uid, not bulk.)
 */
import { sireneToCanonical, pappersToCanonical } from "./map";
import { REGISTRY_TTL_MS, type CanonicalRegistryAccount, type RegistryDeps, type RegistrySegment } from "./types";

const PAGE = 100;
const MAX = 50_000;

/** FR bulk sourcing via SIRENE — yields canonical accounts with legal_id (AC1/AC2). */
export async function* sourceFromRegistry(
  segment: RegistrySegment,
  deps: RegistryDeps,
): AsyncIterable<CanonicalRegistryAccount> {
  const target = Math.min(segment.volume ?? 1000, MAX);
  if (segment.country !== "FR" || !deps.searchSirene) return; // CH bulk unsupported by Zefix
  let yielded = 0;
  for (let page = 1; yielded < target; page++) {
    const res = await deps.meter(
      { workspace: deps.tenantId, kind: "registry.sirene", provider: "sirene", amount: 1, ref: `sirene:p${page}` },
      () =>
        deps.searchSirene!({
          activite_principale: segment.nafCodes,
          departement: segment.regions,
          tranche_effectif_salarie: segment.effectifTranches,
          page,
          perPage: PAGE,
        }),
    );
    const companies = res.companies ?? [];
    for (const c of companies) {
      if (yielded >= target) break;
      const account = sireneToCanonical(c);
      if (deps.upsertAccount) await deps.upsertAccount(deps.tenantId, account);
      yield account;
      yielded++;
    }
    if (companies.length < PAGE) break;
  }
}

/**
 * Field-level enrich by legal_id (AC5), cache-first with a long TTL (AC4). FR
 * resolves via Pappers by SIREN. Returns null when unresolved.
 */
export async function enrichFromRegistry(
  legalId: string,
  deps: RegistryDeps,
): Promise<CanonicalRegistryAccount | null> {
  const cacheKey = `registry:${legalId}`;
  if (deps.cache) {
    const hit = await deps.cache.get(cacheKey);
    if (hit) return hit;
  }
  if (legalId.startsWith("fr:") && deps.fetchPappersBySiren) {
    const siren = legalId.slice(3);
    const company = await deps.meter(
      { workspace: deps.tenantId, kind: "registry.enrich", provider: "pappers", amount: 1, ref: `enrich:${legalId}` },
      () => deps.fetchPappersBySiren!(siren),
    );
    if (!company) return null;
    const account = pappersToCanonical(company);
    if (deps.cache) await deps.cache.set(cacheKey, account, REGISTRY_TTL_MS);
    return account;
  }
  return null;
}
