/**
 * Pure parsing of the accounts-list `?excluded=` query param into a mode.
 * Kept pure (no drizzle) so it unit-tests without a DB; the route maps the
 * mode to an isNull / isNotNull / no-op predicate.
 *
 *   absent | "false" | "0" → "hide"  (default — excluded accounts hidden)
 *   "true"  | "1"          → "only"  (show only excluded)
 *   "all"                  → "all"   (show both)
 */
export type ExcludedMode = "hide" | "only" | "all";

export function parseExcludedMode(param: string | null | undefined): ExcludedMode {
  const p = (param || "false").toLowerCase();
  if (p === "all") return "all";
  if (p === "true" || p === "1") return "only";
  return "hide";
}

/**
 * Accounts-list filters, parsed from query params. Server-side so the count
 * (and the paginated list + infinite scroll) reflect the active filters — the
 * header "N accounts" then shows the *filtered* total, not the library size.
 * Mirrors the per-column filters in the Accounts table (industry, geography,
 * size, revenue, stage, grade, LinkedIn presence, name, domain), the tab
 * (all/tam/manual), and the NL smart-filter score threshold.
 *
 * Kept pure (no drizzle) so it unit-tests without a DB; the route maps each
 * field to a SQL predicate.
 */
export interface AccountListFilters {
  industries: string[];
  geographies: string[]; // matches properties.country
  regions: string[]; // matches properties.state (canton / region / state)
  families: string[]; // sector family keys (resolved to industries via the LLM classifier)
  sizes: string[];
  revenues: string[];
  stages: string[]; // matches the EFFECTIVE stage (manual override > deal-derived > "new")
  grades: string[]; // A+ | A | B | C | D | F
  contactReach: string[]; // none | no_phone | reachable (has a dialable contact?)
  recency: string[]; // never | 7 | 30 | 90 | old (last real interaction, account-level)
  enriched: "yes" | "no" | null; // "no" = base firmographics still missing (to-enrich)
  linkedin: "has" | "empty" | null;
  name: string | null; // substring match
  domain: string | null; // substring match
  listId: string | null; // account-list membership (fList) — scopes to one curated list
  tab: "all" | "tam" | "manual";
  scoreMin: number | null; // smart-filter score >= (e.g. "high fit" -> 70)
  scoreMax: number | null; // smart-filter score <=
}

/** Grade → [minScore, maxScore) — the single source of truth getGrade() uses.
 * A+ is open-ended (no upper bound). A row only earns a grade once enriched. */
export const GRADE_RANGES: Record<string, [number, number | null]> = {
  "A+": [90, null],
  A: [80, 90],
  B: [60, 80],
  C: [40, 60],
  D: [20, 40],
  F: [0, 20],
};

function csv(v: string | null | undefined): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(v: string | null | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseAccountListFilters(params: URLSearchParams): AccountListFilters {
  const tabRaw = (params.get("tab") || "all").toLowerCase();
  const tab = tabRaw === "tam" || tabRaw === "manual" ? tabRaw : "all";
  const linkedinRaw = params.get("fLinkedin");
  const linkedin = linkedinRaw === "has" || linkedinRaw === "empty" ? linkedinRaw : null;
  const enrichedRaw = params.get("fEnriched");
  const enriched = enrichedRaw === "yes" || enrichedRaw === "no" ? enrichedRaw : null;
  return {
    industries: csv(params.get("fIndustry")),
    geographies: csv(params.get("fGeography")),
    regions: csv(params.get("fRegion")),
    families: csv(params.get("fFamily")),
    sizes: csv(params.get("fSize")),
    revenues: csv(params.get("fRevenue")),
    stages: csv(params.get("fStage")),
    grades: csv(params.get("fGrade")).filter((g) => g in GRADE_RANGES),
    contactReach: csv(params.get("fContactReach")),
    recency: csv(params.get("fRecency")),
    enriched,
    linkedin,
    name: params.get("fName")?.trim() || null,
    domain: params.get("fDomain")?.trim() || null,
    listId: params.get("fList")?.trim() || null,
    tab,
    scoreMin: num(params.get("fScoreMin")),
    scoreMax: num(params.get("fScoreMax")),
  };
}

/** True when any account list filter is active (drives whether the header
 * shows a "filtered" total and whether the count must be recomputed). */
export function hasActiveAccountFilters(f: AccountListFilters): boolean {
  return (
    f.industries.length > 0 ||
    f.geographies.length > 0 ||
    f.regions.length > 0 ||
    f.families.length > 0 ||
    f.sizes.length > 0 ||
    f.revenues.length > 0 ||
    f.stages.length > 0 ||
    f.grades.length > 0 ||
    f.contactReach.length > 0 ||
    f.recency.length > 0 ||
    f.enriched !== null ||
    f.linkedin !== null ||
    !!f.name ||
    !!f.domain ||
    !!f.listId ||
    f.tab !== "all" ||
    f.scoreMin !== null ||
    f.scoreMax !== null
  );
}
