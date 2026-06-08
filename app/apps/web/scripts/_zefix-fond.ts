const ENDPOINT = "https://lindas.admin.ch/query";
async function sparql(q: string) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json" }, body: q, signal: AbortSignal.timeout(40000) });
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${t.slice(0,150)}`); return JSON.parse(t);
}
// Precise institutional ICP signals in the NAME (clean, Apollo under-covers these).
const NAME_STEMS: Record<string,string[]> = {
  foundations: ["fondation"],
  health_ems: ["clinique","ems ","hôpital","hopital","centre médico","soins","maison de retraite","résidence"],
  social_para: ["association","institution"],
};
async function count(label: string, stems: string[]) {
  const f = stems.map(s=>`CONTAINS(LCASE(?n), "${s}")`).join(" || ");
  const q = `PREFIX schema: <http://schema.org/>
SELECT (COUNT(DISTINCT ?o) AS ?c) WHERE { ?o a <https://schema.ld.admin.ch/ZefixOrganisation>; schema:legalName ?n; schema:address ?a. ?a schema:addressRegion ?r.
 FILTER(?r IN ("GE","VD","VS","FR","NE","JU")) FILTER(${f}) }`;
  const j = await sparql(q); console.log(`${label}: ${j.results.bindings[0].c.value}`);
}
async function main(){
  await count("romand 'Fondation' (name)", NAME_STEMS.foundations);
  await count("romand health/EMS (name)", NAME_STEMS.health_ems);
  await count("romand association/institution (name)", NAME_STEMS.social_para);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
