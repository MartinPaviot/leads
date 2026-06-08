/**
 * Smart-filter scoping — the contract between the broad full-text search box
 * and the natural-language smart filters on the Accounts / Contacts lists.
 *
 * THE BUG THIS PREVENTS ("41 match / no accounts match"):
 * The list's search box runs a single broad, server-side search across every
 * text category and resolves sectors *semantically* (matchIndustries:
 * "police" → "Law Enforcement", "medical" → "Hospital & Health Care"). The
 * NL parser (/api/filters/parse-nl) used to also turn the same keyword into a
 * client-side text condition like `industry contains "police"`, which
 * applyFilters() then evaluated *literally* — dropping every row the server
 * had matched semantically. The count banner (server, 41) and the table
 * (client, 0) therefore contradicted each other.
 *
 * THE MODEL:
 * - The search box owns ALL text matching, across every category, and does it
 *   better (it's industry-aware). Precise per-field narrowing is the job of
 *   the dedicated column filters.
 * - So a smart filter must NEVER re-encode a keyword/sector/name/title/email
 *   into a positive text match on a text field. It may only carry the
 *   refinements the broad search cannot express: numeric thresholds (fit
 *   score) and explicit exclusions/negations.
 *
 * This module is the single source of truth for that rule (LLM-independent,
 * pure, unit-tested) and for the field catalogs the parser exposes.
 */

import type { FilterCondition, FilterFieldDef, FilterOperator } from "./filters";

// ─────────────────────────────────────────────────────────────
// Field catalogs per resource type (shared with /api/filters/parse-nl)
// ─────────────────────────────────────────────────────────────
// Kept here (not auto-derived from the drizzle schema) so the parser prompt
// stays tight and we can describe intent. Every text field listed here is
// already covered by the broad search box.

export const ACCOUNT_FILTER_FIELDS: readonly FilterFieldDef[] = [
  { key: "name", label: "Account name", type: "text" },
  { key: "domain", label: "Website / domain", type: "text" },
  { key: "industry", label: "Industry", type: "text" },
  { key: "size", label: "Employee count range", type: "text" },
  { key: "revenue", label: "Annual revenue", type: "text" },
  { key: "score", label: "Fit score (0–100)", type: "number" },
] as const;

export const CONTACT_FILTER_FIELDS: readonly FilterFieldDef[] = [
  { key: "firstName", label: "First name", type: "text" },
  { key: "lastName", label: "Last name", type: "text" },
  { key: "title", label: "Job title", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "companyName", label: "Company name", type: "text" },
] as const;

export type SmartResourceType = "account" | "contact";

export const FILTER_FIELD_CATALOGS: Record<SmartResourceType, readonly FilterFieldDef[]> = {
  account: ACCOUNT_FILTER_FIELDS,
  contact: CONTACT_FILTER_FIELDS,
} as const;

// ─────────────────────────────────────────────────────────────
// The scoping rule
// ─────────────────────────────────────────────────────────────

/**
 * Positive text-match operators — the ones the broad search box already
 * performs. A condition using one of these against a free-text field is
 * redundant with the search box and is the source of the literal-vs-semantic
 * contradiction, so it is stripped.
 *
 * NOT included (kept): negations (`not-contains`, `excludes`, `neq`) — the
 * broad search can't express exclusion, and excluding only ever *removes*
 * rows, so it can't produce the "matched count vs empty table" mismatch.
 * Numeric/date/boolean operators are kept regardless of field.
 */
export const POSITIVE_TEXT_OPS: ReadonlySet<FilterOperator> = new Set<FilterOperator>([
  "contains",
  "eq",
  "starts-with",
  "ends-with",
  "includes-any",
  "includes-all",
]);

/**
 * True when a condition merely re-encodes text the broad search box already
 * matches (a positive text op on a text-typed field). Such a condition must
 * not be applied client-side. Pure.
 */
export function isCoveredByFullTextSearch(
  condition: FilterCondition,
  fields: readonly FilterFieldDef[],
): boolean {
  const def = fields.find((f) => f.key === condition.field);
  if (!def) return false;
  return def.type === "text" && POSITIVE_TEXT_OPS.has(condition.operator);
}

/**
 * Drop the conditions already covered by the broad full-text search, keeping
 * only the orthogonal refinements (numeric score thresholds, exclusions).
 * Returns both halves so callers can report what was deferred. Pure.
 */
export function scopeSmartFilters(
  filters: readonly FilterCondition[],
  resourceType: SmartResourceType,
): { kept: FilterCondition[]; deferredToSearch: FilterCondition[] } {
  const fields = FILTER_FIELD_CATALOGS[resourceType];
  const kept: FilterCondition[] = [];
  const deferredToSearch: FilterCondition[] = [];
  for (const c of filters) {
    if (isCoveredByFullTextSearch(c, fields)) deferredToSearch.push(c);
    else kept.push(c);
  }
  return { kept, deferredToSearch };
}
