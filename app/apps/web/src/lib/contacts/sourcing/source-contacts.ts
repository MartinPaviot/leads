/**
 * Spec 15 — deterministic contact sourcing from a qualified account per a
 * persona. PURE: the raw provider fetch (Apollo / registry) is the caller's
 * impure step; this module selects, dedups, caps, and provenance-stamps the
 * candidates. Reuses spec-07 contact identity (email -> linkedin) and respects
 * spec-14 anti-collision through an injected predicate (so this builds off main
 * decoupled from the unmerged spec-14 branch).
 *
 * Blast radius: contacts/sourcing/* only. The LLM title->persona path
 * (lib/scoring/title-persona.ts) and email verification (spec 17) stay out of
 * scope — AC2 here is a deterministic structured filter.
 */

import { norm } from "@/lib/icp/criteria-engine";

/** Default per-account contact cap (AC3) — low by design to protect domain reputation. */
export const DEFAULT_PER_ACCOUNT_CAP = 3;

export interface SourcingPersona {
  /** Norm-substring match against the candidate title. Empty/undefined = no title constraint. */
  titles?: string[];
  /** Exact norm match against the candidate seniority. Empty/undefined = no seniority constraint. */
  seniorities?: string[];
  /** Exact norm match against the candidate department. Empty/undefined = no department constraint. */
  departments?: string[];
}

/** spec-09 qualification — only "qualified" accounts may be sourced (AC1). */
export type AccountQualification = "qualified" | "disqualified" | "needs-review";

export interface SourcingAccount {
  id: string;
  qualification: AccountQualification;
}

export interface ContactCandidate {
  /** Provider-native id — provenance + the deterministic cap tiebreak. */
  externalId: string;
  fullName?: string | null;
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  email?: string | null;
  /** spec-17 verification result if already known; absent = unverified. */
  emailVerified?: boolean;
  linkedinUrl?: string | null;
  /** Provider name for provenance (AC5). */
  provider: string;
  /** Optional rank (higher = better). Breaks the per-account cap deterministically. */
  rank?: number;
}

export interface SourcedContact {
  externalId: string;
  accountId: string;
  fullName: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  email: string | null;
  linkedinUrl: string | null;
  /** Stable contact identity (spec 07): verified email > linkedin > unverified email. */
  identityKey: string;
  /** AC5 provenance. */
  provenance: { provider: string; reason: string };
}

export interface SourceContactsDeps {
  /** AC3 — per-account contact cap. Default {@link DEFAULT_PER_ACCOUNT_CAP}. */
  perAccountCap?: number;
  /** AC4 — identity keys already sourced (this campaign and across campaigns/accounts). */
  alreadySourced?: ReadonlySet<string>;
  /** AC4/spec-14 — true when the contact is locked by another active enrollment. */
  isCollised?: (identityKey: string) => boolean;
}

/** spec-07 email normalization. */
function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** spec-07 linkedin normalization (lowercase, strip trailing slashes). */
function normLinkedin(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "").trim();
}

/**
 * AC4 identity key: verified email > linkedin > unverified email. null when the
 * candidate has neither an email nor a linkedin URL — unidentifiable and
 * unreachable, so it is not sourced.
 */
export function contactIdentityKey(c: ContactCandidate): string | null {
  if (c.email && c.emailVerified) return `email:${normEmail(c.email)}`;
  if (c.linkedinUrl && c.linkedinUrl.trim()) return `li:${normLinkedin(c.linkedinUrl)}`;
  if (c.email && c.email.trim()) return `email:${normEmail(c.email)}`;
  return null;
}

/** AC2 — every specified persona facet must pass (AND); an empty facet is no constraint. */
export function matchesPersona(c: ContactCandidate, persona: SourcingPersona): boolean {
  const titles = (persona.titles ?? []).map(norm).filter(Boolean);
  const seniorities = (persona.seniorities ?? []).map(norm).filter(Boolean);
  const departments = (persona.departments ?? []).map(norm).filter(Boolean);

  if (titles.length > 0) {
    const t = norm(c.title ?? "");
    // Substring both ways: a persona label "ceo" matches a title "ceo & founder",
    // and a persona label "head of marketing" matches a terser title "marketing".
    if (!t || !titles.some((p) => t.includes(p) || p.includes(t))) return false;
  }
  if (seniorities.length > 0) {
    const s = norm(c.seniority ?? "");
    if (!s || !seniorities.includes(s)) return false;
  }
  if (departments.length > 0) {
    const d = norm(c.department ?? "");
    if (!d || !departments.includes(d)) return false;
  }
  return true;
}

function rankOf(c: ContactCandidate): number {
  return typeof c.rank === "number" && Number.isFinite(c.rank) ? c.rank : 0;
}

/**
 * Source the buying-committee contacts for one qualified account.
 *
 * AC1 qualified gate -> drop unidentifiable -> AC2 persona filter -> AC4 dedup by
 * identity + skip already-sourced + skip anti-collision -> AC3 cap (rank desc,
 * externalId asc) -> AC5 provenance. Deterministic for a given input.
 */
export function sourceContacts(
  account: SourcingAccount,
  persona: SourcingPersona,
  candidates: ContactCandidate[],
  deps: SourceContactsDeps = {},
): SourcedContact[] {
  // AC1 — non-qualified accounts source nothing.
  if (account.qualification !== "qualified") return [];

  const cap = deps.perAccountCap ?? DEFAULT_PER_ACCOUNT_CAP;
  const alreadySourced = deps.alreadySourced ?? new Set<string>();
  const isCollised = deps.isCollised ?? (() => false);

  const seenThisCall = new Set<string>();
  const eligible: Array<{ c: ContactCandidate; identityKey: string }> = [];

  for (const c of candidates) {
    const identityKey = contactIdentityKey(c);
    if (!identityKey) continue; // unidentifiable / unreachable
    if (!matchesPersona(c, persona)) continue; // AC2
    // AC4 — dedup within this call, across prior sourcing, and against active locks.
    if (seenThisCall.has(identityKey)) continue;
    if (alreadySourced.has(identityKey)) continue;
    if (isCollised(identityKey)) continue;
    seenThisCall.add(identityKey);
    eligible.push({ c, identityKey });
  }

  // AC3 — deterministic order then cap: best rank first, externalId as a stable tiebreak.
  eligible.sort((a, b) => rankOf(b.c) - rankOf(a.c) || a.c.externalId.localeCompare(b.c.externalId));

  return eligible.slice(0, Math.max(0, cap)).map(({ c, identityKey }) => ({
    externalId: c.externalId,
    accountId: account.id,
    fullName: c.fullName ?? null,
    title: c.title ?? null,
    seniority: c.seniority ?? null,
    department: c.department ?? null,
    email: c.email ?? null,
    linkedinUrl: c.linkedinUrl ?? null,
    identityKey,
    provenance: { provider: c.provider, reason: `sourced:${account.id}` },
  }));
}
