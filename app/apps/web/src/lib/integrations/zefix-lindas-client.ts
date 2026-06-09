/**
 * Zefix via LINDAS (data.admin.ch) — KEYLESS Swiss commercial-registry
 * enrichment over the official Linked-Data SPARQL endpoint. No account, no
 * password: the federal Zefix dataset is public.
 *
 * Endpoint : POST https://lindas.admin.ch/query  (SPARQL)
 * Graph    : https://lindas.admin.ch/foj/zefix   (~6.3M triples)
 * Company  : a schema:Organization with
 *   schema:legalName    -> official legal name
 *   schema:description  -> purpose / Zweck (registration language)
 *   schema:identifier   -> .../UID/CHE…  (Swiss company UID)
 *   schema:additionalType -> eCH-0097 legal-form code
 *
 * The implemented `zefix-client.ts` uses the auth-gated ZefixPublicREST
 * API instead; this client is the no-credentials alternative. It does NOT
 * carry headcount or revenue (Zefix has neither), but the purpose text
 * lets downstream classify the sector. Verified live 2026-06-09.
 */

const LINDAS_ENDPOINT = "https://lindas.admin.ch/query";
const ZEFIX_GRAPH = "https://lindas.admin.ch/foj/zefix";

export interface ZefixLindasFirm {
  uid: string | null; // CHE… (the registry UID)
  name: string | null;
  description: string | null; // purpose / Zweck
  legalForm: string | null; // eCH-0097 code, e.g. "0107"
}

/** Keyless — always available. */
export function isZefixLindasAvailable(): boolean {
  return true;
}

/** A safe SPARQL string literal (escapes \ and "). */
function sparqlString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

async function runSparql(query: string): Promise<Record<string, { value: string }>[]> {
  const res = await fetch(LINDAS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/sparql-results+json",
    },
    body: "query=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINDAS ${res.status}: ${t.slice(0, 160)}`);
  }
  const j = (await res.json()) as { results?: { bindings?: Record<string, { value: string }>[] } };
  return j.results?.bindings ?? [];
}

/**
 * Enrich a Swiss company by NAME against the keyless Zefix LINDAS graph.
 * Matches on an EXACT legal name (lower-cased) so a foreign namesake is
 * never returned. Null when no exact match exists.
 */
export async function enrichSwissCompanyByNameLindas(name: string): Promise<ZefixLindasFirm | null> {
  const q = name.trim();
  if (!q) return null;

  const query = `
    PREFIX schema: <http://schema.org/>
    SELECT ?org
           (SAMPLE(?nm) AS ?name)
           (SAMPLE(?d) AS ?desc)
           (SAMPLE(STR(?lf)) AS ?lform)
           (GROUP_CONCAT(DISTINCT STR(?id); separator="|") AS ?ids)
    WHERE {
      GRAPH <${ZEFIX_GRAPH}> {
        ?org a schema:Organization ; schema:legalName ?nm .
        FILTER(LCASE(STR(?nm)) = LCASE(${sparqlString(q)}))
        OPTIONAL { ?org schema:description ?d }
        OPTIONAL { ?org schema:additionalType ?lf }
        OPTIONAL { ?org schema:identifier ?id }
      }
    }
    GROUP BY ?org
    LIMIT 1`;

  let rows: Record<string, { value: string }>[];
  try {
    rows = await runSparql(query);
  } catch {
    return null; // network / endpoint hiccup — let the waterfall continue
  }
  const r = rows[0];
  if (!r) return null;

  const ids = (r.ids?.value ?? "").split("|");
  const uidUri = ids.find((u) => /\/UID\/CHE/i.test(u)) ?? null;
  const uid = uidUri ? (uidUri.match(/CHE[\d.]+/i)?.[0] ?? null) : null;
  const lf = r.lform?.value ?? null;
  const legalForm = lf ? (lf.split("/").pop() || null) : null;

  return {
    uid,
    name: r.name?.value ?? null,
    description: r.desc?.value?.trim() || null,
    legalForm,
  };
}
