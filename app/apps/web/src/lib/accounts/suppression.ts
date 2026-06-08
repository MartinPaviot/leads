/**
 * Account suppression ledger — the durable memory of removed/excluded accounts.
 *
 * Why this exists: "delete" (soft, deletedAt) and "exclude" (excludedReason)
 * both live ON the companies row, so the only thing stopping a re-import is the
 * per-source dedup query happening to still see that row. That breaks for
 * domain-less accounts (SIRENE/Zefix have a SIREN/UID, no domain) and for any
 * row that's later hard-deleted. This ledger records the STABLE IDENTITY of a
 * removed account (domain + normalized name + native registry id) so every
 * discovery source can skip it for good — and so it can be restored later.
 *
 * Matching is identity-tiered to avoid false positives: a candidate is
 * suppressed if its domain matches, or its native id matches, or (only when it
 * has neither — the SIRENE/Zefix case) its normalized name matches.
 */

import { db } from "@/db";
import { accountSuppressions } from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";

export type SuppressionKind = "deleted" | "excluded";

export interface AccountIdentity {
  domain?: string | null;
  name?: string | null;
  nativeId?: string | null;
  nativeIdType?: string | null;
}

export function normalizeDomain(d?: string | null): string | null {
  if (!d) return null;
  const v = d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return v || null;
}

export function normalizeName(n?: string | null): string | null {
  if (!n) return null;
  const v = n.trim().toLowerCase().replace(/\s+/g, " ");
  return v || null;
}

export function normalizeEmail(e?: string | null): string | null {
  if (!e) return null;
  const v = e.trim().toLowerCase();
  return v || null;
}

export function normalizeLinkedin(l?: string | null): string | null {
  if (!l) return null;
  const v = l
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  return v || null;
}

/** Pull a stable identity out of a company-shaped row (reads properties for native ids). */
export function extractIdentity(c: {
  name?: string | null;
  domain?: string | null;
  properties?: unknown;
}): AccountIdentity {
  const props = (c.properties ?? {}) as Record<string, unknown>;
  let nativeId: string | null = null;
  let nativeIdType: string | null = null;
  if (props.siren) {
    nativeId = String(props.siren);
    nativeIdType = "siren";
  } else if (props.uid) {
    nativeId = String(props.uid);
    nativeIdType = "zefix_uid";
  } else if (props.native_ids && typeof props.native_ids === "object") {
    const entries = Object.entries(props.native_ids as Record<string, unknown>).filter(([, v]) => !!v);
    if (entries.length > 0) {
      nativeIdType = entries[0][0];
      nativeId = String(entries[0][1]);
    }
  } else if (props.apollo_id) {
    nativeId = String(props.apollo_id);
    nativeIdType = "apollo";
  }
  return {
    domain: normalizeDomain(c.domain),
    name: normalizeName(c.name),
    nativeId,
    nativeIdType,
  };
}

type CompanyLike = { id?: string | null; name?: string | null; domain?: string | null; properties?: unknown };

/**
 * Record accounts as suppressed (kind 'deleted' on removal, 'excluded' on
 * not-a-fit). Idempotent per company: re-suppressing replaces the prior row.
 */
export async function suppressAccounts(args: {
  tenantId: string;
  kind: SuppressionKind;
  reason?: string | null;
  createdBy?: string | null;
  companies: CompanyLike[];
}): Promise<number> {
  if (args.companies.length === 0) return 0;
  const rows = args.companies.map((c) => {
    const id = extractIdentity(c);
    return {
      tenantId: args.tenantId,
      companyId: c.id ?? null,
      kind: args.kind,
      reason: args.reason ?? null,
      domain: id.domain ?? null,
      nameNormalized: id.name ?? null,
      nativeId: id.nativeId,
      nativeIdType: id.nativeIdType,
      createdBy: args.createdBy ?? null,
    };
  });
  const companyIds = rows.map((r) => r.companyId).filter((x): x is string => !!x);
  if (companyIds.length > 0) {
    await db
      .delete(accountSuppressions)
      .where(and(eq(accountSuppressions.tenantId, args.tenantId), inArray(accountSuppressions.companyId, companyIds)));
  }
  await db.insert(accountSuppressions).values(rows.map((r) => ({ ...r, entityType: "company" })));
  return rows.length;
}

type ContactLike = { id?: string | null; email?: string | null; linkedinUrl?: string | null; firstName?: string | null; lastName?: string | null };

/** Record contacts as suppressed (same durable ledger, entityType 'contact'). */
export async function suppressContacts(args: {
  tenantId: string;
  kind: SuppressionKind;
  reason?: string | null;
  createdBy?: string | null;
  contacts: ContactLike[];
}): Promise<number> {
  if (args.contacts.length === 0) return 0;
  const rows = args.contacts.map((c) => ({
    tenantId: args.tenantId,
    entityType: "contact",
    companyId: c.id ?? null,
    kind: args.kind,
    reason: args.reason ?? null,
    email: normalizeEmail(c.email),
    linkedin: normalizeLinkedin(c.linkedinUrl),
    nameNormalized: normalizeName([c.firstName, c.lastName].filter(Boolean).join(" ")),
    createdBy: args.createdBy ?? null,
  }));
  const ids = rows.map((r) => r.companyId).filter((x): x is string => !!x);
  if (ids.length > 0) {
    await db
      .delete(accountSuppressions)
      .where(and(eq(accountSuppressions.tenantId, args.tenantId), inArray(accountSuppressions.companyId, ids)));
  }
  await db.insert(accountSuppressions).values(rows);
  return rows.length;
}

/** Lift suppression for the given companies (restore / re-include). */
export async function liftSuppression(tenantId: string, companyIds: string[], kind?: SuppressionKind): Promise<void> {
  if (companyIds.length === 0) return;
  await db
    .delete(accountSuppressions)
    .where(
      and(
        eq(accountSuppressions.tenantId, tenantId),
        inArray(accountSuppressions.companyId, companyIds),
        ...(kind ? [eq(accountSuppressions.kind, kind)] : []),
      ),
    );
}

/**
 * Filter a list of discovery candidates down to those NOT suppressed. Use this
 * in every source before inserting new companies so removed/excluded accounts
 * are never re-imported — including domain-less ones.
 */
export async function filterAllowed<T extends AccountIdentity>(tenantId: string, candidates: T[]): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  const domains = [...new Set(candidates.map((c) => normalizeDomain(c.domain)).filter((x): x is string => !!x))];
  const natives = [...new Set(candidates.map((c) => c.nativeId).filter((x): x is string => !!x))];
  // Name is only a matching key for candidates that have neither domain nor id.
  const names = [
    ...new Set(
      candidates
        .filter((c) => !normalizeDomain(c.domain) && !c.nativeId)
        .map((c) => normalizeName(c.name))
        .filter((x): x is string => !!x),
    ),
  ];
  const orConds = [
    domains.length ? inArray(accountSuppressions.domain, domains) : undefined,
    natives.length ? inArray(accountSuppressions.nativeId, natives) : undefined,
    names.length ? inArray(accountSuppressions.nameNormalized, names) : undefined,
  ].filter(Boolean);
  if (orConds.length === 0) return candidates;

  const sup = await db
    .select({
      domain: accountSuppressions.domain,
      nativeId: accountSuppressions.nativeId,
      nameNormalized: accountSuppressions.nameNormalized,
    })
    .from(accountSuppressions)
    .where(and(eq(accountSuppressions.tenantId, tenantId), or(...orConds)));

  if (sup.length === 0) return candidates;
  const dset = new Set(sup.map((s) => s.domain).filter((x): x is string => !!x));
  const nset = new Set(sup.map((s) => s.nativeId).filter((x): x is string => !!x));
  const nmset = new Set(sup.map((s) => s.nameNormalized).filter((x): x is string => !!x));

  return candidates.filter((c) => {
    const d = normalizeDomain(c.domain);
    if (d && dset.has(d)) return false;
    if (c.nativeId && nset.has(c.nativeId)) return false;
    if (!d && !c.nativeId) {
      const nm = normalizeName(c.name);
      if (nm && nmset.has(nm)) return false;
    }
    return true;
  });
}

export interface ContactIdentity {
  email?: string | null;
  linkedin?: string | null;
}

/**
 * Filter contact candidates down to those NOT suppressed — by email or
 * LinkedIn URL. Use before re-importing contacts so a removed contact never
 * comes back.
 */
export async function filterAllowedContacts<T extends ContactIdentity>(tenantId: string, candidates: T[]): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  const emails = [...new Set(candidates.map((c) => normalizeEmail(c.email)).filter((x): x is string => !!x))];
  const linkedins = [...new Set(candidates.map((c) => normalizeLinkedin(c.linkedin)).filter((x): x is string => !!x))];
  const orConds = [
    emails.length ? inArray(accountSuppressions.email, emails) : undefined,
    linkedins.length ? inArray(accountSuppressions.linkedin, linkedins) : undefined,
  ].filter(Boolean);
  if (orConds.length === 0) return candidates;

  const sup = await db
    .select({ email: accountSuppressions.email, linkedin: accountSuppressions.linkedin })
    .from(accountSuppressions)
    .where(and(eq(accountSuppressions.tenantId, tenantId), or(...orConds)));

  if (sup.length === 0) return candidates;
  const eset = new Set(sup.map((s) => s.email).filter((x): x is string => !!x));
  const lset = new Set(sup.map((s) => s.linkedin).filter((x): x is string => !!x));

  return candidates.filter((c) => {
    const e = normalizeEmail(c.email);
    if (e && eset.has(e)) return false;
    const l = normalizeLinkedin(c.linkedin);
    if (l && lset.has(l)) return false;
    return true;
  });
}
