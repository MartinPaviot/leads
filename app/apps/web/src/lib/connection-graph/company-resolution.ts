/**
 * Company resolution (_specs/CONNECTION-GRAPH).
 *
 * Maps a relation's employer (raw name + domain from the provider) to a
 * CRM `companies` row. This join is what lets the graph overlay onto the
 * ICP. Fail-closed: domain match first (strongest), then exact
 * normalised-name match, else NULL — we never fuzzy-guess a company,
 * because a wrong resolution would mis-route a warm path (a worse error
 * than leaving it unresolved). Reuses the same `norm()` the ICP engine
 * uses so "Société Générale" and "societe generale" reconcile.
 */

import { norm } from "@/lib/icp/criteria-engine";
import type { CompanyCandidate } from "./types";

/** Lowercase host without leading "www." and without a trailing dot. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  // Tolerate a full URL or an email-ish "@acme.com".
  d = d.replace(/^https?:\/\//, "").replace(/^.*@/, "");
  d = d.split("/")[0].split("?")[0];
  d = d.replace(/^www\./, "").replace(/\.$/, "");
  return d || null;
}

/**
 * Resolve `raw` (the relation's employer) to a candidate company id.
 * Returns null when nothing matches with confidence.
 */
export function resolveCompany(
  raw: { name?: string | null; domain?: string | null },
  candidates: CompanyCandidate[],
): string | null {
  const rawDomain = normalizeDomain(raw.domain);
  if (rawDomain) {
    const byDomain = candidates.find(
      (c) => normalizeDomain(c.domain) === rawDomain,
    );
    if (byDomain) return byDomain.id;
  }

  const rawName = raw.name ? norm(raw.name) : "";
  if (rawName) {
    const byName = candidates.find((c) => c.name && norm(c.name) === rawName);
    if (byName) return byName.id;
  }

  return null;
}
