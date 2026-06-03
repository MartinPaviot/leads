/**
 * NAF/APE code mapping + INSEE effectif tranches for Pappers sourcing
 * (France registry). Pure — no I/O — so it's fully unit-testable and the
 * code lists are reusable by hand (paste into Pappers/Pharow/Societeinfo).
 *
 * The NAF code is what makes French sector targeting surgical: Apollo's
 * keyword "industry" is fuzzy (it collapsed ICP-1 to ~37% on-target),
 * whereas e.g. 58.29C = "Édition de logiciels applicatifs" is exact.
 */

/** Normalize an industry label for lookup (lowercase, strip accents/&). */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

/**
 * NAF codes per industry intent. Keys are normalized industry labels
 * (matching the Apollo-style values used in ICP criteria). Codes are the
 * dotted NAF rev.2 form Pappers expects (e.g. "58.29C").
 */
const NAF_BY_INDUSTRY: Record<string, string[]> = {
  // ── Software / SaaS / digital product (ICP-1) ──
  "computer software": ["58.29A", "58.29B", "58.29C", "62.01Z"],
  "software": ["58.29A", "58.29B", "58.29C", "62.01Z"],
  "saas": ["58.29C", "62.01Z", "63.11Z"],
  "information technology and services": ["62.01Z", "62.02A", "62.09Z", "63.11Z"],
  "it services": ["62.01Z", "62.02A", "62.09Z"],
  "internet": ["63.12Z", "63.11Z"],
  // ── Finance / fintech (FR; ICP-2 is Swiss so NAF won't apply there,
  //    but kept for any French fintech targeting) ──
  "financial services": ["64.19Z", "64.99Z", "66.19B"],
  "banking": ["64.19Z"],
  "investment management": ["66.30Z"],
  "capital markets": ["66.12Z", "66.11Z"],
  fintech: ["64.19Z", "64.99Z", "66.19B", "62.01Z"],
};

/** All software/SaaS NAF codes — the ICP-1 "éditeur logiciel" set. */
export const SOFTWARE_NAF = ["58.29A", "58.29B", "58.29C", "62.01Z", "62.02A", "62.09Z", "63.11Z", "63.12Z"];

/** Map a set of industry labels to a de-duped NAF code list. */
export function nafForIndustries(labels: string[]): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    const codes = NAF_BY_INDUSTRY[norm(label)];
    if (codes) codes.forEach((c) => out.add(c));
  }
  return [...out];
}

/** Official French region names Pappers recognises (used to gate out
 *  Swiss/foreign geography — Pappers is France-only). */
const FR_REGIONS = new Set(
  [
    "Île-de-France",
    "Auvergne-Rhône-Alpes",
    "Occitanie",
    "Nouvelle-Aquitaine",
    "Provence-Alpes-Côte d'Azur",
    "Hauts-de-France",
    "Grand Est",
    "Pays de la Loire",
    "Bretagne",
    "Normandie",
    "Bourgogne-Franche-Comté",
    "Centre-Val de Loire",
    "Corse",
  ].map(norm),
);

export function isFrenchRegion(value: string): boolean {
  return FR_REGIONS.has(norm(value));
}

/** Keep only the French regions from a geography criterion's values. */
export function frenchRegions(values: string[]): string[] {
  return values.filter(isFrenchRegion);
}

/**
 * Map an employee min/max to the INSEE "tranche d'effectif" codes that
 * overlap the range (Pappers `tranche_effectif`).
 *   21=50-99 22=100-199 12=20-49 31=200-249 32=250-499 …
 */
const TRANCHES: Array<{ code: string; min: number; max: number }> = [
  { code: "00", min: 0, max: 0 },
  { code: "01", min: 1, max: 2 },
  { code: "02", min: 3, max: 5 },
  { code: "03", min: 6, max: 9 },
  { code: "11", min: 10, max: 19 },
  { code: "12", min: 20, max: 49 },
  { code: "21", min: 50, max: 99 },
  { code: "22", min: 100, max: 199 },
  { code: "31", min: 200, max: 249 },
  { code: "32", min: 250, max: 499 },
  { code: "41", min: 500, max: 999 },
  { code: "42", min: 1000, max: 1999 },
  { code: "51", min: 2000, max: 4999 },
  { code: "52", min: 5000, max: 9999 },
  { code: "53", min: 10000, max: Infinity },
];

export function employeeRangeToTranches(min: number | null, max: number | null): string[] {
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  return TRANCHES.filter((t) => t.max >= lo && t.min <= hi).map((t) => t.code);
}
