/**
 * Translate ICP criteria → Apollo organization search params (P3,
 * _specs/multi-icp). Pure. The inverse of field-catalog: field-catalog
 * declares which criteria map to which Apollo param; this module
 * actually produces the OrgSearchParams from a set of criteria so the
 * TAM build can source the named list for ONE ICP.
 *
 * Only criteria whose field is `apollo_search` translate — they're the
 * ones Apollo can filter on server-side. Criteria on apollo_enrich /
 * custom_property / signal fields are NOT pushed to search; the caller
 * applies them as a post-filter via the scoring matrix (a company is
 * fetched broadly then scored, and low-fit ones drop out).
 *
 * Operator handling per Apollo param shape:
 *   - array params (keyword_tags, locations, technology_uids,
 *     job_titles, person_*): `in` / `eq` / `contains` → string[]
 *   - employee ranges: `between` → ["min,max"] in Apollo's range format
 *     (open-ended max → "min," ; gte/lte degrade to a one-sided range)
 *   - numeric range objects (revenue, total_funding, num_jobs):
 *     `between` → { min, max } ; gte → { min } ; lte → { max }
 *   - date range (latest_funding_date): `between`/`gte` → { min, max }
 *     ISO strings (epoch-ms criterion values converted back to ISO)
 */

import type { OrgSearchParams } from "@/lib/integrations/apollo-client";
import { getStandardField } from "./field-catalog";
import type { Criterion } from "./criteria-engine";
import { toTechnologyUid } from "./apollo-technology-uids";

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function rangeBounds(c: Criterion): { min?: number; max?: number } {
  if (c.operator === "between") {
    const v = (c.value as { min?: unknown; max?: unknown }) ?? {};
    const min = toNum(v.min);
    const max = toNum(v.max);
    return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  }
  const n = toNum(c.value);
  if (n === undefined) return {};
  if (c.operator === "gte" || c.operator === "gt") return { min: n };
  if (c.operator === "lte" || c.operator === "lt") return { max: n };
  return {};
}

function epochToIso(v: unknown): string | undefined {
  const n = toNum(v);
  if (n === undefined) {
    // maybe already an ISO string
    if (typeof v === "string" && v) {
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
    }
    return undefined;
  }
  return new Date(n).toISOString();
}

/**
 * Build a partial OrgSearchParams from an ICP's criteria. Multiple
 * array-valued criteria targeting the same Apollo param are unioned.
 * Returns the params plus the list of criterion ids that did NOT
 * translate (for the caller to apply as a post-filter).
 */
export function criteriaToApolloParams(criteria: Criterion[]): {
  params: OrgSearchParams;
  postFilterCriterionIds: string[];
} {
  const params: OrgSearchParams = {};
  const postFilter: string[] = [];

  // accumulators for array params (union across criteria)
  const keywordTags = new Set<string>();
  const locations = new Set<string>();
  const techUids = new Set<string>();
  const jobTitles = new Set<string>();
  const personTitles = new Set<string>();
  const personSeniorities = new Set<string>();

  for (const c of criteria) {
    const field = getStandardField(c.fieldKey);
    if (!field || field.source !== "apollo_search" || !field.apolloParam) {
      postFilter.push(c.id);
      continue;
    }

    switch (field.apolloParam) {
      case "q_organization_keyword_tags":
        toStringArray(c.value).forEach((v) => keywordTags.add(v));
        break;
      case "organization_locations":
        toStringArray(c.value).forEach((v) => locations.add(v));
        break;
      case "currently_using_any_of_technology_uids":
        // Display name → Apollo slug UID ("Datadog" → "datadog").
        toStringArray(c.value).forEach((v) => techUids.add(toTechnologyUid(v)));
        break;
      case "q_organization_job_titles":
        toStringArray(c.value).forEach((v) => jobTitles.add(v));
        break;
      case "person_titles":
        toStringArray(c.value).forEach((v) => personTitles.add(v));
        break;
      case "person_seniorities":
        toStringArray(c.value).forEach((v) => personSeniorities.add(v));
        break;
      case "organization_num_employees_ranges": {
        const { min, max } = rangeBounds(c);
        if (min !== undefined || max !== undefined) {
          // Apollo employee-range format "min,max"; open-ended → "min,"
          const lo = min ?? 1;
          const hi = max ?? "";
          (params.organization_num_employees_ranges ??= []).push(`${lo},${hi}`);
        }
        break;
      }
      case "revenue_range": {
        const b = rangeBounds(c);
        if (b.min !== undefined || b.max !== undefined) params.revenue_range = b;
        break;
      }
      case "total_funding_range": {
        const b = rangeBounds(c);
        if (b.min !== undefined || b.max !== undefined) params.total_funding_range = b;
        break;
      }
      case "organization_num_jobs_range": {
        const b = rangeBounds(c);
        if (b.min !== undefined || b.max !== undefined) params.organization_num_jobs_range = b;
        break;
      }
      case "latest_funding_date_range": {
        const v = (c.value as { min?: unknown; max?: unknown }) ?? {};
        const min = c.operator === "between" ? epochToIso(v.min) : epochToIso(c.value);
        const max = c.operator === "between" ? epochToIso(v.max) : undefined;
        if (min || max) {
          params.latest_funding_date_range = {
            ...(min ? { min } : {}),
            ...(max ? { max } : {}),
          };
        }
        break;
      }
      default:
        postFilter.push(c.id);
    }
  }

  if (keywordTags.size > 0) params.q_organization_keyword_tags = [...keywordTags];
  if (locations.size > 0) params.organization_locations = [...locations];
  if (techUids.size > 0) params.currently_using_any_of_technology_uids = [...techUids];
  if (jobTitles.size > 0) params.q_organization_job_titles = [...jobTitles];
  // person_titles / person_seniorities live on the people search params;
  // OrgSearchParams doesn't carry them, so they post-filter at the
  // contact level. Record them for the caller.
  if (personTitles.size > 0 || personSeniorities.size > 0) {
    for (const c of criteria) {
      if (c.fieldKey === "person_titles" || c.fieldKey === "person_seniorities") {
        if (!postFilter.includes(c.id)) postFilter.push(c.id);
      }
    }
  }

  return { params, postFilterCriterionIds: postFilter };
}
