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

export interface SireneDirigeant {
  firstName: string | null;
  lastName: string | null;
  role: string | null; // qualité: Président, Directeur général, Gérant…
  isPerson: boolean; // personne physique vs morale
}

export interface SireneDetail {
  siren: string;
  dirigeants: SireneDirigeant[];
  ca: number | null;
  resultatNet: number | null;
  year: string | null;
}

/**
 * Full record by SIREN (minimal=false) — adds dirigeants (decision-maker
 * NAMES + roles, free, no email) + finances (CA, résultat). Keyless.
 */
export async function companyDetailBySiren(siren: string): Promise<SireneDetail | null> {
  const res = await fetch(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&minimal=false&per_page=1`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`recherche-entreprises detail ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  const r = ((Array.isArray(j.results) ? j.results : [])[0] ?? null) as Record<string, unknown> | null;
  if (!r || String(r.siren) !== siren) return null;

  const dirigeants: SireneDirigeant[] = (Array.isArray(r.dirigeants) ? r.dirigeants : [])
    .map((d) => {
      const o = d as Record<string, unknown>;
      return {
        firstName: (o.prenoms as string) ?? null,
        lastName: (o.nom as string) ?? (o.denomination as string) ?? null,
        role: (o.qualite as string) ?? null,
        isPerson: o.type_dirigeant === "personne physique",
      };
    })
    .filter((d) => d.lastName);

  const fin = (r.finances ?? null) as Record<string, { ca?: number; resultat_net?: number }> | null;
  let ca: number | null = null, resultatNet: number | null = null, year: string | null = null;
  if (fin && typeof fin === "object") {
    const years = Object.keys(fin).sort();
    const last = years[years.length - 1];
    if (last) { year = last; ca = fin[last]?.ca ?? null; resultatNet = fin[last]?.resultat_net ?? null; }
  }
  return { siren, dirigeants, ca, resultatNet, year };
}

export interface SireneEnriched {
  siren: string;
  name: string | null;
  naf: string | null; // dotted NAF code, e.g. 62.01Z
  section: string | null; // NAF section letter (A..U), e.g. J
  effectifTranche: string | null; // INSEE code
  foundedYear: number | null;
  city: string | null;
  postalCode: string | null;
  departement: string | null;
  ca: number | null; // latest annual revenue in EUR
  caYear: string | null;
  /** True only when the result's legal name EXACTLY matches the query
   *  (normalized) — the adapter trusts firmographics only on an exact
   *  match, so a US "Apple" can't be enriched with a French "Apple". */
  exact: boolean;
}

function normSireneName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Enrich a French company by NAME (keyless, free). One search call with
 * `minimal=false` already carries NAF, effectif tranche, location and
 * finances (CA). Returns the best result with an `exact` flag the adapter
 * uses to gate on a confident match.
 */
export async function enrichCompanyByNameSirene(
  name: string,
  opts?: { departement?: string },
): Promise<SireneEnriched | null> {
  const q = name.trim();
  if (!q) return null;
  const qs = new URLSearchParams({ q, minimal: "false", per_page: "5", etat_administratif: "A" });
  if (opts?.departement) qs.set("departement", opts.departement);

  const res = await fetch(`${BASE}?${qs}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`recherche-entreprises ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  const results = (Array.isArray(j.results) ? j.results : []) as Array<Record<string, unknown>>;
  if (results.length === 0) return null;

  const target = normSireneName(q);
  const exactIdx = results.findIndex((r) => normSireneName((r.nom_complet ?? r.nom_raison_sociale) as string) === target);
  const r = (exactIdx >= 0 ? results[exactIdx] : results[0]) as Record<string, unknown>;
  const siege = (r.siege ?? {}) as Record<string, unknown>;

  let ca: number | null = null;
  let caYear: string | null = null;
  const fin = (r.finances ?? null) as Record<string, { ca?: number }> | null;
  if (fin && typeof fin === "object") {
    const years = Object.keys(fin).sort();
    const last = years[years.length - 1];
    if (last) {
      caYear = last;
      ca = typeof fin[last]?.ca === "number" ? (fin[last]!.ca as number) : null;
    }
  }

  const dateCreation = (r.date_creation ?? siege.date_creation) as string | null;
  const foundedYear = dateCreation ? Number(String(dateCreation).slice(0, 4)) || null : null;

  return {
    siren: String(r.siren ?? ""),
    name: (r.nom_complet ?? r.nom_raison_sociale ?? null) as string | null,
    naf: (r.activite_principale ?? null) as string | null,
    section: (r.section_activite_principale ?? null) as string | null,
    effectifTranche: (r.tranche_effectif_salarie ?? null) as string | null,
    foundedYear,
    city: (siege.libelle_commune ?? null) as string | null,
    postalCode: (siege.code_postal ?? null) as string | null,
    departement: (siege.departement ?? null) as string | null,
    ca,
    caYear,
    exact: exactIdx >= 0,
  };
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
