/**
 * Canonical identity resolution (spec 00, AC3/AC4). Pure — no DB. Reuses the
 * tested normalizers in lib/companies/identity.ts. Identity is registry-first
 * for accounts and email-first for contacts; vendor ids NEVER participate
 * (AC4). Resolution order + the deviation from the spec's literal order are
 * documented in _specs/00-canonical-data-model/data-contract.md.
 */
import { normalizeCompanyName } from "@/lib/companies/identity";

/** Bare domain: lowercase, strip scheme/www/path. */
export function bareDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  return (
    d
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim() || null
  );
}

/** Digits only (registry ids carry spaces/dots in raw form). */
function digits(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}

export interface AccountIdentityInput {
  domain?: string | null;
  name?: string | null;
  country?: string | null;
  siren?: string | null;
  siret?: string | null;
  uid?: string | null; // CH UID, e.g. CHE-123.456.789
}

/**
 * Registry-first dedup key: fr:<siren> · ch:<uid> · d:<domain> · n:<name>.
 * SIRET (14 digits) collapses to its SIREN (first 9) — the legal entity. Null
 * when there is nothing to key on (such rows are unkeyed, never deduped).
 */
export function accountIdentityKey(p: AccountIdentityInput): string | null {
  const siren = digits(p.siren);
  if (siren) return `fr:${siren}`;
  const siret = digits(p.siret);
  if (siret && siret.length >= 9) return `fr:${siret.slice(0, 9)}`;
  const uid = p.uid ? p.uid.replace(/\s/g, "") : null;
  if (uid) return `ch:${uid}`;
  const dom = bareDomain(p.domain);
  if (dom) return `d:${dom}`;
  const n = normalizeCompanyName(p.name);
  return n ? `n:${n}` : null;
}

export type AccountMatchStep =
  | { by: "identity_key"; value: string }
  | { by: "domain"; value: string }
  | { by: "name_country"; name: string; country: string | null };

/**
 * Ordered match plan, strongest signal first: registry id → domain →
 * normalized name (+ country). The DB resolver tries each step until one
 * matches an existing record, then merges onto it (AC3).
 */
export function accountMatchPlan(p: AccountIdentityInput): AccountMatchStep[] {
  const steps: AccountMatchStep[] = [];
  const siren = digits(p.siren) ?? (digits(p.siret)?.slice(0, 9) || null);
  const uid = p.uid ? p.uid.replace(/\s/g, "") : null;
  if (siren) steps.push({ by: "identity_key", value: `fr:${siren}` });
  else if (uid) steps.push({ by: "identity_key", value: `ch:${uid}` });
  const dom = bareDomain(p.domain);
  if (dom) steps.push({ by: "domain", value: dom });
  const n = normalizeCompanyName(p.name);
  if (n) steps.push({ by: "name_country", name: n, country: p.country ?? null });
  return steps;
}

export interface ContactIdentityInput {
  email?: string | null;
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
}

/** Normalized LinkedIn path (lowercase, no scheme/www/trailing slash) — the
 * `li:` identity key and the dedup/match basis. Exported so LinkedIn providers
 * (spec 36) normalize URLs the SAME way before persistence; a divergent
 * normalization would split identities and break the spec-14 lock. */
export function linkedinPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  return m || null;
}

/** Email-first contact key: e:<email> · li:<linkedin> · nc:<name>@<companyId>. */
export function contactIdentityKey(p: ContactIdentityInput): string | null {
  const email = p.email ? p.email.toLowerCase().trim() : null;
  if (email) return `e:${email}`;
  const li = linkedinPath(p.linkedinUrl);
  if (li) return `li:${li}`;
  const name = [p.firstName, p.lastName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name && p.companyId) return `nc:${name}@${p.companyId}`;
  return null;
}

export type ContactMatchStep =
  | { by: "identity_key"; value: string }
  | { by: "email"; value: string }
  | { by: "linkedin"; value: string };

export function contactMatchPlan(p: ContactIdentityInput): ContactMatchStep[] {
  const steps: ContactMatchStep[] = [];
  const email = p.email ? p.email.toLowerCase().trim() : null;
  if (email) steps.push({ by: "email", value: email });
  const li = linkedinPath(p.linkedinUrl);
  if (li) steps.push({ by: "linkedin", value: li });
  const key = contactIdentityKey(p);
  if (key && key.startsWith("nc:")) steps.push({ by: "identity_key", value: key });
  return steps;
}
