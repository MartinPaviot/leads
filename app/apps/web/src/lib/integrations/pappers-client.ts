/**
 * Pappers API client — French company SEARCH over the official registry
 * (SIRENE/INPI/BODACC). Free token (100 req/mo) → scalable. Auth via the
 * `api_token` query param.
 *
 * GET https://api.pappers.fr/v2/recherche — filters: code_naf, region,
 * tranche_effectif, chiffre_affaires_min/max, date_creation_min/max, …
 * Exhaustive FR coverage (every registered company) — more complete than
 * Apollo's scraped French slice, with the precise NAF sector code.
 *
 * Response field names are parsed defensively; confirm against a live
 * token (free signup at pappers.fr/api).
 */

export interface PappersCompany {
  siren: string;
  name: string | null;
  codeNaf: string | null;
  libelleNaf: string | null;
  /** Bare domain when Pappers has a website; many small FR cos have none. */
  website: string | null;
  city: string | null;
  postalCode: string | null;
  dateCreation: string | null;
}

export interface PappersSearchResult {
  total: number;
  companies: PappersCompany[];
}

export function isPappersAvailable(): boolean {
  return Boolean(process.env.PAPPERS_API_KEY);
}

function cleanDomain(w: unknown): string | null {
  if (typeof w !== "string" || !w.trim()) return null;
  return (
    w.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim() ||
    null
  );
}

export async function searchCompaniesPappers(params: {
  code_naf?: string[];
  region?: string[];
  tranche_effectif?: string[];
  page?: number;
  perPage?: number;
}): Promise<PappersSearchResult> {
  const token = process.env.PAPPERS_API_KEY;
  if (!token) throw new Error("PAPPERS_API_KEY not set");

  const qs = new URLSearchParams();
  qs.set("api_token", token);
  qs.set("par_page", String(params.perPage ?? 100));
  qs.set("page", String(params.page ?? 1));
  qs.set("entreprise_cessee", "false");
  if (params.code_naf?.length) qs.set("code_naf", params.code_naf.join(","));
  if (params.region?.length) qs.set("region", params.region.join(","));
  if (params.tranche_effectif?.length) qs.set("tranche_effectif", params.tranche_effectif.join(","));

  const res = await fetch(`https://api.pappers.fr/v2/recherche?${qs}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Pappers ${res.status}: ${t.slice(0, 200)}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;
  const list = (Array.isArray(raw?.resultats)
    ? raw.resultats
    : Array.isArray(raw?.entreprises)
      ? raw.entreprises
      : []) as Array<Record<string, unknown>>;

  const companies: PappersCompany[] = list
    .map((e) => {
      const siege = (e.siege ?? {}) as Record<string, unknown>;
      return {
        siren: String(e.siren ?? ""),
        name: (e.nom_entreprise ?? e.denomination ?? e.nom ?? null) as string | null,
        codeNaf: (e.code_naf ?? null) as string | null,
        libelleNaf: (e.libelle_code_naf ?? null) as string | null,
        website: cleanDomain(e.site_web ?? siege.site_web),
        city: (siege.ville ?? null) as string | null,
        postalCode: (siege.code_postal ?? null) as string | null,
        dateCreation: (e.date_creation ?? null) as string | null,
      };
    })
    .filter((c) => c.siren);

  return { total: Number(raw?.total ?? companies.length), companies };
}
