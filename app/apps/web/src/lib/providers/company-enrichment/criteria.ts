/**
 * Enrichment criteria registry.
 *
 * The "Enrich" action used to be all-or-nothing: it ran the whole
 * waterfall and tried to fill every field at once, with no way for the
 * user to say "just fill revenue" — and no honest per-field feedback.
 *
 * A *criterion* is a user-facing unit of enrichment ("Revenue",
 * "LinkedIn", "Funding"). It maps to one or more `EnrichedCompany`
 * fields and declares which provider authoritatively fills it. The UI
 * lets the user pick criteria à la carte; the route only persists +
 * reports the fields belonging to the requested criteria.
 *
 * Base criteria are the common firmographics already shown as left-hand
 * columns in the accounts table (Industry, Geography, Size, Revenue,
 * LinkedIn) plus the company description. They are enriched by default
 * (one click). À-la-carte criteria (`isBase: false`) are opt-in extras
 * that aren't surfaced as standard columns.
 *
 * Phase 1 routes every criterion through Apollo (the only broadly
 * available company source today). The `source` field is declared per
 * criterion now so Phase 2 can route, e.g., `revenue` → Pappers and
 * `geography` (FR/CH, no domain) → SIRENE/Zefix without touching the
 * call sites.
 */

import type { EnrichedCompany } from "./types";

export type CriterionKey =
  | "industry"
  | "description"
  | "geography"
  | "size"
  | "revenue"
  | "linkedin"
  | "foundedYear"
  | "technologies"
  | "funding"
  | "keywords";

export interface EnrichmentCriterion {
  key: CriterionKey;
  /** Short user-facing label (column header / checkbox). */
  label: string;
  /** One-line description of what the criterion fills, for tooltips. */
  hint: string;
  /**
   * `EnrichedCompany` fields this criterion fills. A criterion counts
   * as resolved when *any* of these has a value (e.g. `size` is
   * satisfied by either `employeeCount` or a `sizeRange` bucket).
   */
  fields: ReadonlyArray<keyof EnrichedCompany>;
  /**
   * Provider slug that authoritatively fills this criterion. Phase 1:
   * all Apollo. Declared per criterion so the waterfall can route by
   * criterion later without changing callers.
   */
  source: string;
  /**
   * Base criteria are enriched by default and correspond to the
   * accounts table's left-hand columns. À-la-carte criteria are opt-in.
   */
  isBase: boolean;
}

/**
 * The criteria catalog, in display order. Base first (matching the
 * left-to-right column order of the accounts table), then à-la-carte.
 */
export const ENRICHMENT_CRITERIA: readonly EnrichmentCriterion[] = [
  {
    key: "industry",
    label: "Industry",
    hint: "Primary sector / vertical",
    fields: ["industry"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "description",
    label: "Description",
    hint: "What the company does, in one line",
    fields: ["description"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "geography",
    label: "Geography",
    hint: "City, state and country of the HQ",
    fields: ["city", "state", "country"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "size",
    label: "Size",
    hint: "Headcount band",
    fields: ["employeeCount", "sizeRange"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "revenue",
    label: "Revenue",
    hint: "Estimated annual revenue",
    fields: ["annualRevenue", "revenueRange"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    hint: "Company LinkedIn profile URL",
    fields: ["linkedinUrl"],
    source: "apollo",
    isBase: true,
  },
  {
    key: "foundedYear",
    label: "Founded year",
    hint: "Year the company was founded",
    fields: ["foundedYear"],
    source: "apollo",
    isBase: false,
  },
  {
    key: "technologies",
    label: "Tech stack",
    hint: "Detected technologies in use",
    fields: ["technologies"],
    source: "apollo",
    isBase: false,
  },
  {
    key: "funding",
    label: "Funding",
    hint: "Latest stage, total raised and investors",
    fields: ["fundingStage", "totalFunding", "investors"],
    source: "apollo",
    isBase: false,
  },
  {
    key: "keywords",
    label: "Keywords",
    hint: "Descriptive keywords / tags",
    fields: ["keywords"],
    source: "apollo",
    isBase: false,
  },
] as const;

const CRITERIA_BY_KEY: ReadonlyMap<CriterionKey, EnrichmentCriterion> = new Map(
  ENRICHMENT_CRITERIA.map((c) => [c.key, c]),
);

export const ALL_CRITERIA_KEYS: readonly CriterionKey[] = ENRICHMENT_CRITERIA.map((c) => c.key);

export const BASE_CRITERIA_KEYS: readonly CriterionKey[] = ENRICHMENT_CRITERIA
  .filter((c) => c.isBase)
  .map((c) => c.key);

export function getCriterion(key: string): EnrichmentCriterion | undefined {
  return CRITERIA_BY_KEY.get(key as CriterionKey);
}

export function listBaseCriteria(): EnrichmentCriterion[] {
  return ENRICHMENT_CRITERIA.filter((c) => c.isBase);
}

export function listExtraCriteria(): EnrichmentCriterion[] {
  return ENRICHMENT_CRITERIA.filter((c) => !c.isBase);
}

/**
 * Resolve a requested set of criterion keys into criteria, in catalog
 * order. Unknown keys are dropped (defensive against stale clients).
 * `undefined` / empty → the base set, so a plain "Enrich" with no
 * selection fills the default columns (back-compat with the old button).
 */
export function resolveCriteria(keys?: readonly string[] | null): EnrichmentCriterion[] {
  if (!keys || keys.length === 0) return listBaseCriteria();
  const wanted = new Set(keys);
  return ENRICHMENT_CRITERIA.filter((c) => wanted.has(c.key));
}

/** Union of every `EnrichedCompany` field the given criteria touch. */
export function fieldsForCriteria(
  criteria: readonly EnrichmentCriterion[],
): Set<keyof EnrichedCompany> {
  const out = new Set<keyof EnrichedCompany>();
  for (const c of criteria) for (const f of c.fields) out.add(f);
  return out;
}

/** True for a non-empty enrichment value (string, number, or array). */
export function hasEnrichmentValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** True when any of the criterion's fields holds a value in `source`. */
export function criterionPresent(
  criterion: EnrichmentCriterion,
  source: Partial<EnrichedCompany> | null | undefined,
): boolean {
  if (!source) return false;
  return criterion.fields.some((f) => hasEnrichmentValue(source[f]));
}

export type CriterionOutcome = "filled" | "already-present" | "not-found";

/**
 * Decide, per criterion, what actually happened — the backbone of
 * honest feedback. `before` is the company's state prior to the run;
 * `after` is the merged result the waterfall produced.
 *
 *   already-present : it had a value before (we didn't need to fetch)
 *   filled          : it was empty before and now has a value
 *   not-found       : still empty after the run (the provider had nothing)
 */
export function evaluateCriterion(
  criterion: EnrichmentCriterion,
  before: Partial<EnrichedCompany> | null | undefined,
  after: Partial<EnrichedCompany> | null | undefined,
): CriterionOutcome {
  if (criterionPresent(criterion, before)) return "already-present";
  if (criterionPresent(criterion, after)) return "filled";
  return "not-found";
}
