/**
 * Retro-compat: translate the legacy 6 flat `tenants.settings.target*`
 * fields into multi-ICP criteria (P1b, _specs/multi-icp R10).
 *
 * Pure. The retro-compat migration reads a tenant's settings, calls
 * this to build the "Default" ICP's criteria, and inserts them. The
 * goal is zero behavior change: a tenant that had targetIndustries +
 * targetCompanySizes + targetGeographies keeps targeting exactly that,
 * now expressed as ICP criteria instead of flat fields.
 *
 * Mapping (flat field → catalog fieldKey + operator):
 *   targetIndustries    → industry            in       [...]
 *   targetKeywords      → keywords            in       [...]
 *   targetCompanySizes  → employee_count      between  { min, max }   (envelope)
 *   targetRevenueMin/Max→ revenue             between  { min, max }
 *   targetTechnologies  → technologies        in       [...]
 *   targetGeographies   → geography           in       [...]
 *   totalFundingMin/Max → total_funding       between  { min, max }
 *   minJobOpenings      → num_open_jobs       gte      n
 *   hiringTitles        → hiring_job_titles   in       [...]
 *   targetSeniorities   → person_seniorities  in       [...apollo-format]
 *
 * Three flat fields are intentionally NOT mapped here:
 *   - targetDepartments: no apollo_search department field in the catalog
 *     (apollo-client doesn't push person_departments).
 *   - excludeGeographies (geography_exclude): it's a SOURCING-only
 *     exclusion (organization_not_locations). The fit scorer
 *     (computeIcpFit) has no negation operator, so seeding it as a soft
 *     criterion would dilute every company's fit. Exclusion is honored at
 *     source by /api/tam and by rule-builder-authored geography_exclude
 *     criteria (now translated — see to-apollo-params), not frozen here.
 *   - fundingRecencyDays: it's RELATIVE ("last 180 days"). Freezing it to
 *     an absolute date at seed time would go stale; the build paths apply
 *     it live instead.
 *
 * Company sizes are disjoint ranges ("11-50", "51-200"); the criteria
 * engine is AND-only, so we collapse the selection to its min-max
 * ENVELOPE (min of lows, max of highs). This is a faithful best-effort
 * preservation for the auto-migrated Default ICP — a user refining the
 * ICP later can split it into precise ranges.
 */

import { senioritiesToApollo } from "@/lib/config/icp-constants";
import type { Criterion } from "./criteria-engine";

export type LegacyIcpSettings = {
  targetIndustries?: string[] | null;
  targetCompanySizes?: string[] | null;
  targetGeographies?: string[] | null;
  targetSeniorities?: string[] | null;
  targetDepartments?: string[] | null;
  // Full Apollo filter surface (parity with the onboarding card).
  targetKeywords?: string[] | null;
  targetTechnologies?: string[] | null;
  targetRevenueMin?: number | null;
  targetRevenueMax?: number | null;
  totalFundingMin?: number | null;
  totalFundingMax?: number | null;
  minJobOpenings?: number | null;
  hiringTitles?: string[] | null;
};

/** Parse a UI size label ("501-1,000", "10,001+") to numeric bounds. */
export function parseSizeLabel(label: string): { min: number; max: number | null } {
  const clean = label.replace(/,/g, "").trim();
  if (clean.endsWith("+")) {
    return { min: Number(clean.slice(0, -1)) || 0, max: null };
  }
  const [lo, hi] = clean.split("-");
  return { min: Number(lo) || 0, max: hi ? Number(hi) : null };
}

/** Collapse a set of size labels to a single {min,max} envelope. */
export function sizesToEnvelope(
  sizes: string[],
): { min: number; max: number | null } | null {
  if (!sizes || sizes.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max: number | null = 0;
  for (const s of sizes) {
    const { min: lo, max: hi } = parseSizeLabel(s);
    if (lo < min) min = lo;
    if (hi === null) max = null; // open-ended top bucket dominates
    else if (max !== null && hi > max) max = hi;
  }
  return { min: Number.isFinite(min) ? min : 0, max };
}

let counter = 0;
function nextId(prefix: string): string {
  // Deterministic-ish id for criteria built in-memory before insert.
  // The DB insert assigns the real uuid; this id is only used by the
  // pure engine for matched/unmatched bookkeeping in tests.
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Build the Default-ICP criteria from legacy flat settings. All
 * criteria are SOFT (weight 1, not required) so the Default ICP
 * behaves like the old additive scoring rather than hard-excluding
 * companies that miss one dimension — preserving today's behavior
 * where a company scores partial fit on partial match.
 */
export function legacySettingsToCriteria(
  settings: LegacyIcpSettings,
): Array<Omit<Criterion, "id"> & { id: string }> {
  const criteria: Array<Omit<Criterion, "id"> & { id: string }> = [];

  if (settings.targetIndustries && settings.targetIndustries.length > 0) {
    criteria.push({
      id: nextId("industry"),
      fieldKey: "industry",
      operator: "in",
      value: settings.targetIndustries,
      weight: 1,
      isRequired: false,
    });
  }

  if (settings.targetKeywords && settings.targetKeywords.length > 0) {
    criteria.push({
      id: nextId("keywords"),
      fieldKey: "keywords",
      operator: "in",
      value: settings.targetKeywords,
      weight: 1,
      isRequired: false,
    });
  }

  if (settings.targetTechnologies && settings.targetTechnologies.length > 0) {
    criteria.push({
      id: nextId("technologies"),
      fieldKey: "technologies",
      operator: "in",
      value: settings.targetTechnologies,
      weight: 1,
      isRequired: false,
    });
  }

  if (settings.hiringTitles && settings.hiringTitles.length > 0) {
    criteria.push({
      id: nextId("hiring_job_titles"),
      fieldKey: "hiring_job_titles",
      operator: "in",
      value: settings.hiringTitles,
      weight: 1,
      isRequired: false,
    });
  }

  // Numeric ranges — emit only when at least one bound is set. The
  // criteria-engine `between` reads { min, max }; an undefined bound is a
  // one-sided range (to-apollo-params + the scorer both honour that).
  if (
    typeof settings.targetRevenueMin === "number" ||
    typeof settings.targetRevenueMax === "number"
  ) {
    criteria.push({
      id: nextId("revenue"),
      fieldKey: "revenue",
      operator: "between",
      value: {
        ...(typeof settings.targetRevenueMin === "number" ? { min: settings.targetRevenueMin } : {}),
        ...(typeof settings.targetRevenueMax === "number" ? { max: settings.targetRevenueMax } : {}),
      },
      weight: 1,
      isRequired: false,
    });
  }

  if (
    typeof settings.totalFundingMin === "number" ||
    typeof settings.totalFundingMax === "number"
  ) {
    criteria.push({
      id: nextId("total_funding"),
      fieldKey: "total_funding",
      operator: "between",
      value: {
        ...(typeof settings.totalFundingMin === "number" ? { min: settings.totalFundingMin } : {}),
        ...(typeof settings.totalFundingMax === "number" ? { max: settings.totalFundingMax } : {}),
      },
      weight: 1,
      isRequired: false,
    });
  }

  if (typeof settings.minJobOpenings === "number" && settings.minJobOpenings > 0) {
    criteria.push({
      id: nextId("num_open_jobs"),
      fieldKey: "num_open_jobs",
      operator: "gte",
      value: settings.minJobOpenings,
      weight: 1,
      isRequired: false,
    });
  }

  const envelope = settings.targetCompanySizes
    ? sizesToEnvelope(settings.targetCompanySizes)
    : null;
  if (envelope) {
    criteria.push({
      id: nextId("employee_count"),
      fieldKey: "employee_count",
      operator: "between",
      value: { min: envelope.min, max: envelope.max },
      weight: 1,
      isRequired: false,
    });
  }

  if (settings.targetGeographies && settings.targetGeographies.length > 0) {
    criteria.push({
      id: nextId("geography"),
      fieldKey: "geography",
      operator: "in",
      value: settings.targetGeographies,
      weight: 1,
      isRequired: false,
    });
  }

  if (settings.targetSeniorities && settings.targetSeniorities.length > 0) {
    criteria.push({
      id: nextId("person_seniorities"),
      fieldKey: "person_seniorities",
      operator: "in",
      value: senioritiesToApollo(settings.targetSeniorities),
      weight: 1,
      isRequired: false,
    });
  }

  return criteria;
}

/** Reset the in-memory id counter — test helper. */
export function __resetCriteriaIdCounter(): void {
  counter = 0;
}

// ── Persona-search bridge ──────────────────────────────────────────
// The NL persona search (/api/icp/parse-nl, PersonaSearch) produces a
// flat ICP with short field names (industries/geographies/companySizes/
// technologies). Map it onto the legacy target* shape and reuse the
// canonical converter above — so the live preview runs the EXACT criteria
// the build will source, no divergence.

export interface PersonaIcp {
  industries?: string[];
  keywords?: string[];
  companySizes?: string[];
  geographies?: string[];
  technologies?: string[];
  revenueMin?: number | null;
  revenueMax?: number | null;
  hiringTitles?: string[];
}

export function personaIcpToCriteria(
  p: PersonaIcp,
): Array<Omit<Criterion, "id"> & { id: string }> {
  return legacySettingsToCriteria({
    targetIndustries: p.industries ?? null,
    targetKeywords: p.keywords ?? null,
    targetCompanySizes: p.companySizes ?? null,
    targetGeographies: p.geographies ?? null,
    targetTechnologies: p.technologies ?? null,
    targetRevenueMin: p.revenueMin ?? null,
    targetRevenueMax: p.revenueMax ?? null,
    hiringTitles: p.hiringTitles ?? null,
  });
}
