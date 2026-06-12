/**
 * Honest role freshness — a prospect's title/company comes from a data
 * provider at source time and is never independently re-verified, so the
 * provider can be months behind reality (a contact who left in February
 * still reads "current" all spring). We never *assert* a role as a
 * verified fact: the UI shows when it was last sourced ("poste à confirmer")
 * and lets the rep mark a contact as having left the role, which excludes
 * them from call lists and strikes the title on the fiche.
 *
 * Pure helpers only (no DB / no provider names) so they're unit-testable
 * and safe to import from both server and client. The "left the role" flag
 * lives in `contacts.properties.roleObsoleteAt` (jsonb, no migration).
 */

/** jsonb key under contacts.properties marking the stored role as stale. */
export const ROLE_OBSOLETE_KEY = "roleObsoleteAt";

type Props = Record<string, unknown> | null | undefined;

/** True when the rep has flagged this contact's stored role as no longer held. */
export function isRoleObsolete(properties: Props): boolean {
  if (!properties || typeof properties !== "object") return false;
  const v = (properties as Record<string, unknown>)[ROLE_OBSOLETE_KEY];
  return typeof v === "string" && v.length > 0;
}

/** When the role was flagged obsolete, or null. */
export function roleObsoleteAt(properties: Props): string | null {
  if (!properties || typeof properties !== "object") return null;
  const v = (properties as Record<string, unknown>)[ROLE_OBSOLETE_KEY];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Return a new properties object with the obsolete flag set (immutable). */
export function withRoleObsolete(
  properties: Props,
  whenIso: string,
): Record<string, unknown> {
  return { ...(properties ?? {}), [ROLE_OBSOLETE_KEY]: whenIso };
}

/** Return a new properties object with the obsolete flag cleared (immutable). */
export function withoutRoleObsolete(properties: Props): Record<string, unknown> {
  const next = { ...(properties ?? {}) } as Record<string, unknown>;
  delete next[ROLE_OBSOLETE_KEY];
  return next;
}

/**
 * Strip a trailing company name that a provider glued onto the title
 * ("Directeur Général Afiro" + company "Afiro" → "Directeur Général").
 * Conservative: only removes the company token when it's a *suffix*, after
 * an optional separator, so mid-title mentions ("Responsable Afiro Centre")
 * are left intact. Always trims and collapses whitespace.
 */
export function normalizeTitle(
  rawTitle: string | null | undefined,
  companyName?: string | null,
): string | null {
  let t = (rawTitle ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;

  const company = (companyName ?? "").replace(/\s+/g, " ").trim();
  if (company) {
    // Match an optional separator (-, –, —, @, ·, |, /, ",", "chez", "at")
    // then the company name, anchored to the end of the string.
    const sep = "(?:\\s*[-–—@·|/,]\\s*|\\s+(?:chez|at)\\s+|\\s+)";
    const re = new RegExp(`${sep}${escapeRegExp(company)}\\s*$`, "i");
    const stripped = t.replace(re, "").trim();
    // Guard: never strip the whole title away (e.g. title === company).
    if (stripped.length > 0) t = stripped;
  }
  return t || null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Short French freshness note for a sourced role. Never claims the role is
 * verified — it states recency and asks for confirmation.
 *   - never sourced → "poste non vérifié"
 *   - sourced       → "poste à confirmer · sourcé il y a 5 j"
 */
export function roleFreshnessNote(
  lastEnrichedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const rel = relativeFr(lastEnrichedAt, now);
  if (!rel) return "poste non vérifié";
  return `poste à confirmer · sourcé ${rel}`;
}

/**
 * "il y a X min/h/j/mois/an" — French relative time, or null for a missing/
 * unparseable date. Shared so the freshness note and any UI agree.
 */
export function relativeFr(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const then = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = now.getTime() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.round(mo / 12)} an${mo >= 24 ? "s" : ""}`;
}
