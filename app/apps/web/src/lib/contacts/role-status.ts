/**
 * Honest role freshness — a prospect's title/company comes from a data
 * provider at source time and is never independently re-verified, so the
 * provider can be months behind reality (a contact who left in February
 * still reads "current" all spring). Instead of asking the rep to confirm,
 * we verify the role ourselves against the live LinkedIn profile (Apify,
 * just-in-time when the contact enters the call list) and store the result:
 *   - confirmed → the fiche shows the verified role (no "à confirmer" label)
 *   - left      → roleObsoleteAt is set, dropping them from call lists
 * The rep can still mark "left the role" manually.
 *
 * Pure helpers only (no DB / no provider names) so they're unit-testable
 * and safe to import from both server and client. State lives in
 * `contacts.properties` (jsonb, no migration): `roleObsoleteAt` (left) and
 * `roleVerification` (the cached LinkedIn check).
 */

import type { Locale } from "@/lib/i18n/messages";

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

/** jsonb key under contacts.properties holding the cached LinkedIn check. */
export const ROLE_VERIFICATION_KEY = "roleVerification";

export type RoleVerificationStatus = "confirmed" | "left";

export interface RoleVerification {
  /** ISO timestamp of the check. */
  at: string;
  status: RoleVerificationStatus;
  /** Current title per LinkedIn (the verified truth), when known. */
  title: string | null;
  /** Current company per LinkedIn, when known. */
  company: string | null;
}

/** Read the cached LinkedIn verification, or null if never verified. */
export function getRoleVerification(properties: Props): RoleVerification | null {
  if (!properties || typeof properties !== "object") return null;
  const v = (properties as Record<string, unknown>)[ROLE_VERIFICATION_KEY];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.status !== "confirmed" && o.status !== "left") return null;
  if (typeof o.at !== "string") return null;
  return {
    at: o.at,
    status: o.status,
    title: typeof o.title === "string" ? o.title : null,
    company: typeof o.company === "string" ? o.company : null,
  };
}

/** Return a new properties object carrying the verification result (immutable). */
export function withRoleVerification(
  properties: Props,
  v: RoleVerification,
): Record<string, unknown> {
  return { ...(properties ?? {}), [ROLE_VERIFICATION_KEY]: v };
}

/**
 * True when a verification exists and is younger than `ttlDays` — used to
 * skip re-checking (and re-paying) a contact we verified recently.
 */
export function isVerificationFresh(
  properties: Props,
  ttlDays: number,
  now: Date = new Date(),
): boolean {
  const v = getRoleVerification(properties);
  if (!v) return false;
  const at = new Date(v.at).getTime();
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < ttlDays * 86_400_000;
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

/**
 * English twin of relativeFr — "just now / X min/h/d/mo/yr ago", or null for a
 * missing/unparseable date. Same breakpoints so the two locales stay in sync.
 */
export function relativeEn(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const then = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = now.getTime() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  const y = Math.round(mo / 12);
  return `${y} yr${y >= 2 ? "s" : ""} ago`;
}

/** Locale-aware relative time; default FR so existing callers are unchanged. */
export function relativeTime(
  iso: string | Date | null | undefined,
  locale: Locale = "fr",
  now: Date = new Date(),
): string | null {
  return locale === "en" ? relativeEn(iso, now) : relativeFr(iso, now);
}
