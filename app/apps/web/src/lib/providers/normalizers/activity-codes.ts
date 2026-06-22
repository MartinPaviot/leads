/**
 * Registry activity code -> NAICS (spec 06, AC3). FR NAF/APE and CH NOGA both
 * derive from NACE, so a single NACE-division -> NAICS-sector table backs both
 * mappers. Pure. Pairs with industry.ts (label -> NAICS); this is code -> NAICS.
 */
import type { NaicsSector } from "./industry";

// NACE division (2-digit) -> NAICS 2-digit sector code + label.
const NACE_DIVISION_TO_NAICS: Array<{ from: number; to: number; code: string; label: string }> = [
  { from: 1, to: 3, code: "11", label: "Agriculture, Forestry, Fishing and Hunting" },
  { from: 5, to: 9, code: "21", label: "Mining, Quarrying, and Oil and Gas Extraction" },
  { from: 10, to: 33, code: "31-33", label: "Manufacturing" },
  { from: 35, to: 35, code: "22", label: "Utilities" },
  { from: 36, to: 39, code: "22", label: "Utilities" },
  { from: 41, to: 43, code: "23", label: "Construction" },
  { from: 45, to: 46, code: "42", label: "Wholesale Trade" },
  { from: 47, to: 47, code: "44-45", label: "Retail Trade" },
  { from: 49, to: 53, code: "48-49", label: "Transportation and Warehousing" },
  { from: 55, to: 56, code: "72", label: "Accommodation and Food Services" },
  { from: 58, to: 63, code: "51", label: "Information" },
  { from: 64, to: 66, code: "52", label: "Finance and Insurance" },
  { from: 68, to: 68, code: "53", label: "Real Estate and Rental and Leasing" },
  { from: 69, to: 75, code: "54", label: "Professional, Scientific, and Technical Services" },
  { from: 77, to: 82, code: "56", label: "Administrative and Support Services" },
  { from: 84, to: 84, code: "92", label: "Public Administration" },
  { from: 85, to: 85, code: "61", label: "Educational Services" },
  { from: 86, to: 88, code: "62", label: "Health Care and Social Assistance" },
  { from: 90, to: 93, code: "71", label: "Arts, Entertainment, and Recreation" },
  { from: 94, to: 96, code: "81", label: "Other Services" },
];

/** Extract the leading 2-digit NACE division from a NAF ("62.01Z") or NOGA ("6201") code. */
function naceDivision(code: string | null | undefined): number | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, "");
  if (digits.length < 2) return null;
  const d = parseInt(digits.slice(0, 2), 10);
  return Number.isNaN(d) ? null : d;
}

function divisionToNaics(d: number | null): NaicsSector | null {
  if (d === null) return null;
  for (const r of NACE_DIVISION_TO_NAICS) {
    if (d >= r.from && d <= r.to) return { code: r.code, label: r.label };
  }
  return null;
}

/** FR NAF/APE code -> NAICS sector, or null. */
export function nafToNaics(naf: string | null | undefined): NaicsSector | null {
  return divisionToNaics(naceDivision(naf));
}

/** CH NOGA code -> NAICS sector, or null. */
export function nogaToNaics(noga: string | null | undefined): NaicsSector | null {
  return divisionToNaics(naceDivision(noga));
}

// INSEE "tranche d'effectif" code -> human headcount band (AC2).
const INSEE_EFFECTIF: Record<string, string> = {
  "00": "0", "01": "1-2", "02": "3-5", "03": "6-9", "11": "10-19", "12": "20-49",
  "21": "50-99", "22": "100-199", "31": "200-249", "32": "250-499", "41": "500-999",
  "42": "1,000-1,999", "51": "2,000-4,999", "52": "5,000-9,999", "53": "10,000+",
};

/** INSEE effectif tranche code -> headcount band label, or null. */
export function inseeEffectifToBand(code: string | null | undefined): string | null {
  if (!code) return null;
  return INSEE_EFFECTIF[code.trim()] ?? null;
}
