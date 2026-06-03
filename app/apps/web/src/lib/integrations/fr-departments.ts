/**
 * French region name → département codes, for the gouv "recherche-
 * entreprises" SIRENE API (filters by `departement`, not region name).
 * Pure. The 13 metropolitan regions; ICP-1's regions are the first four.
 */

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s_-]+/g, " ").trim();
}

const REGION_DEPARTEMENTS: Record<string, string[]> = {
  "ile de france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "auvergne rhone alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "nouvelle aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  "provence alpes cote d azur": ["04", "05", "06", "13", "83", "84"],
  "hauts de france": ["02", "59", "60", "62", "80"],
  "grand est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "pays de la loire": ["44", "49", "53", "72", "85"],
  bretagne: ["22", "29", "35", "56"],
  normandie: ["14", "27", "50", "61", "76"],
  "bourgogne franche comte": ["21", "25", "39", "58", "70", "71", "89", "90"],
  "centre val de loire": ["18", "28", "36", "37", "41", "45"],
  corse: ["2A", "2B"],
};

/** Départements for a region value (name). Empty if not a French region. */
export function departementsForRegion(value: string): string[] {
  return REGION_DEPARTEMENTS[norm(value)] ?? [];
}

/** Union of départements for a list of region values (deduped). */
export function departementsForRegions(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) for (const d of departementsForRegion(v)) out.add(d);
  return [...out];
}

/** True when the value is a recognised French region. */
export function isFrenchRegionName(value: string): boolean {
  return Boolean(REGION_DEPARTEMENTS[norm(value)]);
}

// Pretty region names (for storing back on a company), keyed by the
// normalized form used internally.
const PRETTY_REGION: Record<string, string> = {
  "ile de france": "Île-de-France",
  "auvergne rhone alpes": "Auvergne-Rhône-Alpes",
  occitanie: "Occitanie",
  "nouvelle aquitaine": "Nouvelle-Aquitaine",
  "provence alpes cote d azur": "Provence-Alpes-Côte d'Azur",
  "hauts de france": "Hauts-de-France",
  "grand est": "Grand Est",
  "pays de la loire": "Pays de la Loire",
  bretagne: "Bretagne",
  normandie: "Normandie",
  "bourgogne franche comte": "Bourgogne-Franche-Comté",
  "centre val de loire": "Centre-Val de Loire",
  corse: "Corse",
};

// Reverse index: département code → normalized region key.
const DEPT_TO_REGION = new Map<string, string>();
for (const [region, depts] of Object.entries(REGION_DEPARTEMENTS)) {
  for (const d of depts) DEPT_TO_REGION.set(d, region);
}

/** The (pretty) region name a département belongs to, or null. */
export function regionNameForDepartement(dept: string | null | undefined): string | null {
  if (!dept) return null;
  const key = DEPT_TO_REGION.get(String(dept).trim());
  return key ? PRETTY_REGION[key] : null;
}
