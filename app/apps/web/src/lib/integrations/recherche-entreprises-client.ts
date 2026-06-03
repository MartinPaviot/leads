/**
 * Client for the French government "recherche-entreprises" API — the
 * official SIRENE company search. KEYLESS, free, exhaustive (every French
 * company), authoritative (legal name, NAF, effectif tranche, active
 * status, location). This is the cleanest French firmographic source —
 * the "bonnes informations" backbone (no Apollo scraping).
 *
 * GET https://recherche-entreprises.api.gouv.fr/search
 *   activite_principale=58.29C  departement=75,92  tranche_effectif_salarie=21,22
 *   etat_administratif=A (active)  page  per_page (max 25)
 *
 * No website/domain field (SIRENE has none) — domain + contacts come from
 * the enrichment waterfall (by name+SIREN). SIRENE = clean IDENTITY.
 */

const BASE = "https://recherche-entreprises.api.gouv.fr/search";

export interface SireneCompany {
  siren: string;
  name: string | null;
  naf: string | null;
  libelleNaf: string | null;
  effectifTranche: string | null; // INSEE code: 21=50-99, 22=100-199, …
  postalCode: string | null;
  city: string | null;
  departement: string | null;
  active: boolean;
}

export interface SireneSearchResult {
  total: number;
  pages: number;
  companies: SireneCompany[];
}

/** Keyless — always available. */
export function isSireneAvailable(): boolean {
  return true;
}

export async function searchCompaniesSirene(params: {
  activite_principale?: string[];
  departement?: string[];
  tranche_effectif_salarie?: string[];
  page?: number;
  perPage?: number;
}): Promise<SireneSearchResult> {
  const qs = new URLSearchParams();
  if (params.activite_principale?.length) qs.set("activite_principale", params.activite_principale.join(","));
  if (params.departement?.length) qs.set("departement", params.departement.join(","));
  if (params.tranche_effectif_salarie?.length)
    qs.set("tranche_effectif_salarie", params.tranche_effectif_salarie.join(","));
  qs.set("etat_administratif", "A");
  qs.set("page", String(params.page ?? 1));
  qs.set("per_page", String(Math.min(25, params.perPage ?? 25)));

  const res = await fetch(`${BASE}?${qs}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`recherche-entreprises ${res.status}: ${t.slice(0, 160)}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  const results = (Array.isArray(j.results) ? j.results : []) as Array<Record<string, unknown>>;
  const companies: SireneCompany[] = results
    .map((r) => {
      const siege = (r.siege ?? {}) as Record<string, unknown>;
      return {
        siren: String(r.siren ?? ""),
        name: (r.nom_complet ?? r.nom_raison_sociale ?? null) as string | null,
        naf: (r.activite_principale ?? null) as string | null,
        libelleNaf: (r.libelle_activite_principale ?? null) as string | null,
        effectifTranche: (r.tranche_effectif_salarie ?? null) as string | null,
        postalCode: (siege.code_postal ?? null) as string | null,
        city: (siege.libelle_commune ?? null) as string | null,
        departement: (siege.departement ?? null) as string | null,
        active: String(r.etat_administratif ?? "A") === "A",
      };
    })
    .filter((c) => c.siren);
  return {
    total: Number(j.total_results ?? companies.length),
    pages: Number(j.total_pages ?? 1),
    companies,
  };
}
