/** Quantify lead-pool levers (throwaway). Apollo total_entries per scope. */
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const ROMAND = ["Geneva", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura", "Lausanne", "Genève", "Sion"];
const FR_VOISINE = ["Haute-Savoie", "Ain", "Lyon", "Rhône-Alpes", "Annecy", "Grenoble"];

async function count(label: string, params: Parameters<typeof searchOrganizations>[0]) {
  try {
    const r = await searchOrganizations({ ...params, page: 1, per_page: 1 });
    console.log(`${label}: ${r.pagination?.total_entries ?? "?"}`);
  } catch (e) { console.log(`${label}: ERR ${(e as Error).message.slice(0, 80)}`); }
}

async function main() {
  console.log("=== ROMAND (size bands) ===");
  await count("romand 1-50", { organization_locations: ROMAND, organization_num_employees_ranges: ["1,10", "11,50"] });
  await count("romand 51-100", { organization_locations: ROMAND, organization_num_employees_ranges: ["51,100"] });
  await count("romand 101-1000 (current ICP)", { organization_locations: ROMAND, organization_num_employees_ranges: ["101,200", "201,500", "501,1000"] });
  await count("romand 1001-5000", { organization_locations: ROMAND, organization_num_employees_ranges: ["1001,2000", "2001,5000"] });
  console.log("=== GEO EXPANSION (101-1000) ===");
  await count("ALL Switzerland 101-1000", { organization_locations: ["Switzerland"], organization_num_employees_ranges: ["101,200", "201,500", "501,1000"] });
  await count("France voisine 101-1000", { organization_locations: FR_VOISINE, organization_num_employees_ranges: ["101,200", "201,500", "501,1000"] });
  await count("ALL France 101-1000", { organization_locations: ["France"], organization_num_employees_ranges: ["101,200", "201,500", "501,1000"] });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
