/**
 * Creation gate (Martin's rule, 2026-06-17): never create a company row we have
 * no precise knowledge of and no way to get it. A company is "knowable" if we
 * already hold a firmographic (industry / size / revenue / country / state /
 * city / employee_count) OR we have a domain to enrich from. With NEITHER, the
 * row can never be ICP-scored (geography is a required criterion) — it's a dead
 * stub — so creation must skip it.
 *
 * Pure: no DB, no network. Callers (import / webhook / sourcing) run it before
 * inserting; a knowable row should also enqueue `company/created` so the
 * firmographics get filled.
 */

export interface CompanyKnowableInput {
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  revenue?: string | null;
  properties?: Record<string, unknown> | null;
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim() !== "" : v != null && v !== "";
}

/** Firmographic property keys that count as "we know something precise". */
const FIRMO_PROP_KEYS = ["country", "state", "city", "region", "employee_count", "industry"] as const;

/**
 * True when the company can be placed in the ICP — either it already carries a
 * firmographic, or it has a domain we can enrich from. False ONLY when there is
 * no domain AND no firmographic at all (an unknowable stub — do not create).
 */
export function companyIsKnowable(input: CompanyKnowableInput): boolean {
  if (nonEmpty(input.domain)) return true;
  if (nonEmpty(input.industry) || nonEmpty(input.size) || nonEmpty(input.revenue)) return true;
  const props = input.properties ?? {};
  return FIRMO_PROP_KEYS.some((k) => nonEmpty(props[k]));
}

/** Inverse, for readable call sites (skip when not knowable). */
export function isKnowlessStub(input: CompanyKnowableInput): boolean {
  return !companyIsKnowable(input);
}
