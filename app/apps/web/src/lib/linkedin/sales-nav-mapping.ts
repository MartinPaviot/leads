/**
 * Spec 36 (T11) — map a Unipile LinkedIn/Sales-Navigator search result onto the
 * canonical model, and expose the user-configurable "LinkedIn categories" that
 * can be surfaced as custom fields.
 *
 * COHABITATION (the 3 fixes baked in here):
 *  - linkedin_url is normalized via `linkedinPath` ON WRITE (fix #3) so a LinkedIn
 *    contact dedups onto the same canonical row as the Apollo one (no split).
 *  - the canonical write uses provider "unipile" (fix #1: route through
 *    upsertContact/upsertAccount, done by the caller) which now has a precedence
 *    rank (fix #2, precedence.ts) so LinkedIn wins its own fields, Apollo keeps
 *    funding/firmographics/email.
 *
 * All helpers here are PURE + unit-tested; the canonical upsert is the caller's.
 */

import { linkedinPath } from "@/db/canonical/identity";
import type { LinkedInSearchResult } from "@/lib/providers/unipile/http";
import type { FieldType } from "@/lib/context/custom-fields";

/** First listed current position (company/title), defensive on field names. */
export function currentPosition(r: LinkedInSearchResult): { company: string | null; title: string | null } {
  const p = (r.current_positions ?? [])[0] ?? {};
  return {
    company: (p.company ?? p.company_name ?? null) as string | null,
    title: (p.title ?? p.role ?? null) as string | null,
  };
}

/** Map a Unipile network_distance to a degree label. */
export function searchDegree(networkDistance: string | undefined): "1st" | "2nd" | "3rd" | null {
  const nd = (networkDistance ?? "").toUpperCase();
  if (nd.includes("1") || nd.includes("FIRST")) return "1st";
  if (nd.includes("2") || nd.includes("SECOND")) return "2nd";
  if (nd.includes("3") || nd.includes("THIRD")) return "3rd";
  return null;
}

/** Canonical CONTACT fields a Sales-Nav result contributes (provider="unipile"). */
export interface SalesNavContactFields {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  /** Normalized bare path — the dedup key shared with Apollo. */
  linkedinUrl: string | null;
}

export function salesNavToContact(r: LinkedInSearchResult): SalesNavContactFields {
  const pos = currentPosition(r);
  return {
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
    title: pos.title ?? r.headline ?? null,
    linkedinUrl: linkedinPath(r.public_profile_url ?? r.profile_url) ?? null,
  };
}

/** Canonical ACCOUNT fields a person-result contributes (the employer). */
export interface SalesNavAccountFields {
  name: string | null;
}

export function salesNavToAccount(r: LinkedInSearchResult): SalesNavAccountFields {
  return { name: currentPosition(r).company };
}

// ── Configurable LinkedIn categories (user opts in via custom fields) ──

export interface LinkedInFieldDef {
  /** Stable key — also the custom-field id when the user enables it. */
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** Pure extractor from a search/profile result. */
  extract: (r: LinkedInSearchResult) => string | number | null;
}

/**
 * The catalog of LinkedIn-sourced categories a user can add as custom fields
 * (Settings → custom fields offers these as one-click templates). Enabling a key
 * adds a CustomFieldDef with id = key; enrichment/sourcing then writes its value
 * into properties.customFields[key]. Add to this list to offer a new category.
 */
export const LINKEDIN_FIELD_CATALOG: readonly LinkedInFieldDef[] = [
  { key: "linkedin_headline", label: "LinkedIn headline", type: "text", extract: (r) => r.headline ?? null },
  { key: "linkedin_connection_degree", label: "Connection degree", type: "single_select", options: ["1st", "2nd", "3rd"], extract: (r) => searchDegree(r.network_distance) },
  { key: "linkedin_location", label: "LinkedIn location", type: "text", extract: (r) => r.location ?? null },
  { key: "linkedin_industry", label: "LinkedIn industry", type: "text", extract: (r) => r.industry ?? null },
  { key: "linkedin_current_company", label: "Current company (LinkedIn)", type: "text", extract: (r) => currentPosition(r).company },
  { key: "linkedin_current_title", label: "Current title (LinkedIn)", type: "text", extract: (r) => currentPosition(r).title },
  { key: "linkedin_mutual_connections", label: "Mutual connections", type: "number", extract: (r) => (typeof r.shared_connections_count === "number" ? r.shared_connections_count : null) },
  { key: "linkedin_recent_posts", label: "Recent posts", type: "number", extract: (r) => (typeof r.recent_posts_count === "number" ? r.recent_posts_count : null) },
  { key: "linkedin_premium", label: "LinkedIn premium", type: "single_select", options: ["yes", "no"], extract: (r) => (typeof r.premium === "boolean" ? (r.premium ? "yes" : "no") : null) },
];

const CATALOG_BY_KEY = new Map(LINKEDIN_FIELD_CATALOG.map((f) => [f.key, f]));

/** Is this custom-field key a LinkedIn-sourced category? */
export function isLinkedInCategory(key: string): boolean {
  return CATALOG_BY_KEY.has(key);
}

/**
 * Extract values for the LinkedIn categories the tenant has ENABLED. Returns
 * `{ [key]: value }` for the enabled keys that the result actually has — the
 * caller writes these into properties.customFields. Pure.
 */
export function linkedinCustomFieldValues(r: LinkedInSearchResult, enabledKeys: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of enabledKeys) {
    const def = CATALOG_BY_KEY.get(key);
    if (!def) continue;
    const v = def.extract(r);
    if (v !== null && v !== "") out[key] = v;
  }
  return out;
}
