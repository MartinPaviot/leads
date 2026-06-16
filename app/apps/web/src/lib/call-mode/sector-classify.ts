/**
 * Sector classification WATERFALL — cross the signals we hold on a company to
 * pick the call-script sector as reliably as possible, instead of trusting any
 * single (often wrong) field. Apollo's free-text industry tags a "Haute école
 * de santé" as "hospital & health care"; its NAICS code (6113 = colleges) and
 * its name ("haute école") both say education. So each signal VOTES with a
 * weight = its reliability, and we take the argmax.
 *
 *   NAICS/SIC code  +5   (official taxonomy — the most reliable structured fact)
 *   name (org type) +5   (always present, honest about school/federation/…)
 *   icp_sector      +3   (our own prior classification)
 *   Apollo industry +2   (least reliable)
 *   keywords        +1   (sparse)
 *
 * Pure + provider-neutral + unit-tested. Deterministic; an LLM tier can sit
 * BELOW this for the rare company with no NAICS and no telling name (cache it
 * on the row then) — not needed while the structured signals decide.
 */

import { matchSectorKey, SECTOR_KEYS } from "./call-scripts";

export interface SectorSignals {
  name?: string | null;
  industry?: string | null;
  /** Apollo NAICS codes, e.g. ["62211"]. */
  naics?: string[] | null;
  sic?: string[] | null;
  /** Our own prior classification label, e.g. "Santé", "Éducation / formation". */
  icpSector?: string | null;
  keywords?: string[] | null;
}

export interface SectorClassification {
  key: string;
  confidence: "high" | "medium" | "low";
  /** Which signals voted for the winning key (for the UI "détecté via …"). */
  via: string[];
  scores: Record<string, number>;
}

// NAICS prefix → sector (longest/most-specific patterns first). NAICS 2-digit
// sectors: 61 education, 62 health & social, 81 orgs, 92 public admin, 54 prof
// services, 23/31-33/42/44-49 construction/manuf/trade/transport.
const NAICS_MAP: Array<[RegExp, string]> = [
  [/^9281/, "international"],                  // international affairs (UN/OIG)
  [/^61/, "education"],                         // educational services
  [/^624/, "fondations"],                      // social assistance (terrain social)
  [/^62/, "sante"],                            // ambulatory/hospitals/nursing
  [/^813[1-9]/, "fondations"],                 // religious/grantmaking/civic/professional orgs
  [/^92/, "parapublic"],                       // public administration
  [/^5415/, "it"],                             // computer systems design
  [/^(5416|5411|5412|5413|5414)/, "conseil"],  // mgmt/legal/accounting/architecture/specialised
  [/^(23|31|32|33|42|44|45|48|49)/, "low-tech"], // construction/manuf/wholesale/retail/transport
];

function naicsToKey(codes?: string[] | null): string | null {
  for (const c of codes ?? []) {
    const code = String(c).replace(/\D/g, "");
    if (!code) continue;
    for (const [re, key] of NAICS_MAP) if (re.test(code)) return key;
  }
  return null;
}

// Our icp_sector French labels → key.
const ICP_MAP: Array<[RegExp, string]> = [
  [/[ée]ducation|formation|enseignement|[ée]cole|universit/i, "education"],
  [/international|f[ée]d[ée]rat/i, "international"],
  [/fondation|social|associ|nonprofit|caritat|philanthrop/i, "fondations"],
  [/sant|soin|m[ée]dic|health/i, "sante"],
  [/public|administr|parapublic|commune|canton/i, "parapublic"],
  [/conseil|consult/i, "conseil"],
  [/\bit\b|informatique|logiciel|software|num[ée]rique/i, "it"],
];
function icpToKey(icp?: string | null): string | null {
  const s = (icp ?? "").trim();
  if (!s) return null;
  for (const [re, key] of ICP_MAP) if (re.test(s)) return key;
  return null;
}

const WEIGHTS = { naics: 5, name: 5, icp: 3, industry: 2, keywords: 1 };
const tieBreak = (a: string, b: string) =>
  (SECTOR_KEYS.indexOf(a as (typeof SECTOR_KEYS)[number]) + 1 || 99) -
  (SECTOR_KEYS.indexOf(b as (typeof SECTOR_KEYS)[number]) + 1 || 99);

/** Cross all signals → the best sector key, with confidence + provenance. */
export function classifyScriptSector(sig: SectorSignals): SectorClassification {
  const scores: Record<string, number> = {};
  const vias: Record<string, string[]> = {};
  const add = (key: string | null, w: number, label: string) => {
    if (!key || key === "generic") return;
    scores[key] = (scores[key] ?? 0) + w;
    (vias[key] ??= []).push(label);
  };
  add(naicsToKey(sig.naics) ?? naicsToKey(sig.sic), WEIGHTS.naics, "code NAICS");
  add(matchSectorKey(sig.name), WEIGHTS.name, "nom");
  add(icpToKey(sig.icpSector), WEIGHTS.icp, "classif ICP");
  add(matchSectorKey(sig.industry), WEIGHTS.industry, "industrie");
  add(matchSectorKey((sig.keywords ?? []).join(" ")), WEIGHTS.keywords, "mots-clés");

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]));
  if (ranked.length === 0) return { key: "generic", confidence: "low", via: [], scores };
  const [key, top] = ranked[0];
  const confidence = top >= 7 ? "high" : top >= 4 ? "medium" : "low";
  return { key, confidence, via: vias[key] ?? [], scores };
}
