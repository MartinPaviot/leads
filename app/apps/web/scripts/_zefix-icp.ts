/**
 * Zefix/LINDAS romand ICP-sector probe (throwaway).
 * Counts + samples romand companies whose purpose matches ICP sectors
 * (foundations / health / médico-social / parapublic), using ACCENT-FREE
 * stems (SPARQL LCASE doesn't strip accents). Feasibility for net-new ICP
 * sourcing beyond the (exhausted) Apollo romand pool.
 */
const ENDPOINT = "https://lindas.admin.ch/query";

// Accent-free substrings present inside the accented French terms:
//   santé→"sant", médico→"dico", hôpital→"pital", établissement→"ablissement"
const STEMS = ["fondation", "sant", "soin", "social", "clinique", "dico", "pital", "handicap", "ehpad", "parapublic"];

async function sparql(query: string) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json" },
    body: query,
    signal: AbortSignal.timeout(40_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINDAS ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const filterExpr = STEMS.map((s) => `CONTAINS(LCASE(?purpose), "${s}")`).join(" || ");

async function main() {
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);

  const countQ = `PREFIX schema: <http://schema.org/>
SELECT (COUNT(DISTINCT ?org) AS ?n) WHERE {
  ?org a <https://schema.ld.admin.ch/ZefixOrganisation> ;
       schema:description ?purpose ; schema:address ?a .
  ?a schema:addressRegion ?c .
  FILTER(?c IN ("GE","VD","VS","FR","NE","JU"))
  FILTER(${filterExpr})
}`;
  const c = await sparql(countQ);
  console.log(`romand ICP-sector companies (purpose match): ${c.results?.bindings?.[0]?.n?.value}`);

  const sampleQ = `PREFIX schema: <http://schema.org/>
SELECT ?legalName ?c ?purpose WHERE {
  ?org a <https://schema.ld.admin.ch/ZefixOrganisation> ;
       schema:legalName ?legalName ; schema:description ?purpose ; schema:address ?a .
  ?a schema:addressRegion ?c .
  FILTER(?c IN ("GE","VD","VS","FR","NE","JU"))
  FILTER(${filterExpr})
} LIMIT 18`;
  const s = await sparql(sampleQ);
  console.log(`\nsample:`);
  for (const b of s.results?.bindings ?? []) {
    console.log(`  [${b.c.value}] ${b.legalName.value} :: ${String(b.purpose.value).replace(/\s+/g, " ").slice(0, 90)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
