/**
 * Build the DELETE id list = the 93 small accounts MINUS the 21 kept ones
 * (international institutions / NGOs / IGOs / federations / parapublic + the
 * one mis-sized large healthcare group). Reads the audited dump, validates that
 * every KEEP id actually exists, writes the delete-ids file the delete script
 * reads. Prints the full split for the record.
 *
 *   pnpm dlx tsx scripts/pilae-small-build-delete-list.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const DUMP = "../../../../_research/raw/pilae-small-accounts-2026-06-16.json";
const OUT = "../../../../_research/raw/pilae-small-delete-ids-2026-06-16.json";

// KEEP — classified on real labels (name / industry / domain TLD).
const KEEP = new Map<string, string>([
  ["df58b53f-47bf-42ab-a940-42b7ba6a1e31", "Air Transport Action Group (ATAG) — intl association"],
  ["20cf0c4c-ba0e-4f5b-9157-7e355bab6f36", "DVB Project — intl standards consortium"],
  ["53bd5516-7c01-4619-9ec4-76bf703f8356", "Foro Económico Mundial (WEF) — intl institution"],
  ["86da87c1-1321-4b0a-8087-b067b1f8ea45", "Global Coalition for Efficient Logistics — nonprofit coalition"],
  ["6a720d2e-41a4-41ce-978a-e34583c9b7bb", "Greater Geneva Bern area (GGBa) — parapublic econ dev"],
  ["8a5f2930-57a2-4f45-ac95-80676f8039a8", "Green Cross International — NGO"],
  ["ef9445c8-f413-4d06-9650-48eca51c3b81", "HbbTV Association — intl standards association"],
  ["b50b3170-758e-4140-97c1-6a1e3959f520", "IELA — intl exhibition logistics association"],
  ["0de2b48f-93d3-438b-9e30-48c6faadf9aa", "International Social Security Association — IGO (.int)"],
  ["7ab54b18-7c55-433e-a451-9b0c0ade10c1", "IUPAP — intl scientific union"],
  ["1c5c62bd-78ed-4e10-a2b3-92d726c1f632", "ITA-AITES — intl tunnelling association"],
  ["7e3918b9-f840-4d21-9ed5-85bf771f3bfe", "Race For Water Foundation — NGO"],
  ["d758051f-2565-4bbb-bf92-0ba7265f7d5d", "Solar Impulse Foundation — NGO"],
  ["ea5284ed-826a-4f70-9407-fe22fac40c21", "SportAccord — intl sport umbrella"],
  ["f732a47f-f265-4f82-93ab-5622b6dd1ebd", "IFRA — intl fragrance association"],
  ["12e0f821-fbc3-4d61-92d9-804cd3655cce", "The Martin Ennals Award — human-rights NGO"],
  ["1208871d-37eb-474e-930c-93fb580780ca", "UN Today — UN-ecosystem nonprofit"],
  ["6e3c25ac-0055-4922-b1f8-8d3d00a221e4", "UN-REDD Programme — UN programme"],
  ["c8d063c9-2c16-4722-ad4d-0bece737c127", "World Climate Research Programme (WCRP) — intl programme"],
  ["4ff11c22-3548-40f4-9762-ea016c39eb56", "World Gymnastics (FIG) — intl sport federation"],
  ["98a27791-9fd1-4e40-b3f7-bdcc5b7cab20", "AEVIS VICTORIA SA — large healthcare/hospitality group (mis-sized)"],
]);

type C = { id: string; name: string; size: string | null; industry: string | null; domain: string | null; contacts: number };

const dump: C[] = JSON.parse(readFileSync(new URL(DUMP, import.meta.url), "utf8"));
const byId = new Map(dump.map((c) => [c.id, c]));

// Validate KEEP ids exist (catch typos before we delete anything).
const missing = [...KEEP.keys()].filter((id) => !byId.has(id));
if (missing.length) {
  console.error("KEEP ids not found in dump (typo?):", missing);
  process.exit(1);
}

const del = dump.filter((c) => !KEEP.has(c.id));
const keep = dump.filter((c) => KEEP.has(c.id));

console.log(`Total: ${dump.length}  |  KEEP: ${keep.length}  |  DELETE: ${del.length}\n`);
console.log("=== KEEP (institutions / NGO / IGO / federations / parapublic) ===");
for (const c of keep.sort((a, b) => (a.name || "").localeCompare(b.name || "")))
  console.log(`  ✓ ${(c.name || "").padEnd(52)} sz=${String(c.size).padEnd(4)} ${KEEP.get(c.id)}`);

console.log("\n=== DELETE (commercial SMB < 50 FTE) ===");
for (const c of del.sort((a, b) => (a.name || "").localeCompare(b.name || "")))
  console.log(`  ✗ ${(c.name || "").padEnd(48)} sz=${String(c.size).padEnd(4)} ${(c.industry || "-").padEnd(28)} ct=${c.contacts}`);

writeFileSync(new URL(OUT, import.meta.url), JSON.stringify(del.map((c) => c.id), null, 2));
console.log(`\nWrote ${del.length} delete ids to ${OUT}`);
