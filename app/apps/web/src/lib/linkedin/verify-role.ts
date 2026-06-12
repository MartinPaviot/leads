/**
 * Decide, from a live LinkedIn profile, whether a prospect still holds the
 * role we have on file. Pure + unit-tested; the Apify fetch and the DB write
 * live in the Inngest worker.
 *
 *   confirmed → a current LinkedIn position is at the stored company
 *   left      → the person has current position(s), none at the stored company
 *   unknown   → no stored company, or the profile exposes no current position
 *               (fail-closed: a thin/failed scrape must not read as "left")
 */
import type { LinkedInProfile } from "./apify-profile";

export type RoleComparison =
  | { status: "confirmed"; title: string | null; company: string | null }
  | { status: "left"; title: string | null; company: string | null }
  | { status: "unknown" };

/** Lowercase, strip accents, legal suffixes and punctuation for fuzzy match. */
export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  let s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  // Drop common legal forms and noise tokens.
  s = s.replace(
    /\b(sa|sas|sarl|sasu|gmbh|ag|inc|llc|ltd|limited|co|corp|corporation|group|groupe|holding|holdings|company|sàrl|société|societe)\b/g,
    " ",
  );
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

/** True when two company names plausibly refer to the same company. */
export function companiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Containment, but guard against trivial short tokens matching everything.
  const shorter = na.length <= nb.length ? na : nb;
  const longer = shorter === na ? nb : na;
  return shorter.length >= 4 && longer.includes(shorter);
}

export function compareRole(
  stored: { storedCompany: string | null | undefined },
  profile: LinkedInProfile,
): RoleComparison {
  const storedCompany = (stored.storedCompany ?? "").trim();
  if (!storedCompany) return { status: "unknown" };

  const currents = profile.positions.filter((p) => p.isCurrent);
  if (currents.length === 0) return { status: "unknown" };

  const match = currents.find((p) => companiesMatch(p.company, storedCompany));
  if (match) {
    return { status: "confirmed", title: match.title, company: match.company };
  }
  // Has a current role, but not at the company we have on file → moved on.
  const top = currents[0];
  return { status: "left", title: top.title, company: top.company };
}
