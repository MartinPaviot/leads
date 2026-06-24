/**
 * Spec 22 — Drizzle-backed suppression lookup for the send/enroll hot path.
 *
 * The pure module (./suppression) is O(1) over an in-memory store; this adapter
 * loads just the candidate rows for a target (a single indexed query over the
 * `suppression` table) into an InMemorySuppressionStore and REUSES the tested
 * `isSuppressed` logic — so DB and in-memory share one code path. The row loader
 * is injected, so this is unit-testable without a live database.
 */

import { db as defaultDb } from "@/db";
import { suppression } from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  InMemorySuppressionStore,
  isSuppressed,
  suppressionKey,
  GLOBAL_SCOPE,
  normalizeEmail,
  normalizeDomain,
  domainOfEmail,
  type SuppressionEntry,
  type SuppressionTarget,
  type SuppressionHit,
  type SuppressionLevel,
  type SuppressionType,
} from "./suppression";

/** Loads the suppression rows that could match a target. Injected for testing. */
export type SuppressionRowLoader = (target: SuppressionTarget) => Promise<SuppressionEntry[]>;

interface SuppressionRow {
  tenantId: string | null;
  level: string;
  value: string;
  type: string;
  reason: string | null;
  permanent: boolean;
  expiresAt: Date | string | null;
  createdAt: Date | string | null;
}

function ms(v: Date | string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Map a DB row to the pure spec-22 entry (tenant_id NULL → global scope). */
export function rowToEntry(r: SuppressionRow): SuppressionEntry {
  return {
    scope: r.tenantId ?? GLOBAL_SCOPE,
    level: r.level as SuppressionLevel,
    value: r.value,
    type: r.type as SuppressionType,
    reason: r.reason ?? undefined,
    permanent: r.permanent,
    createdAt: ms(r.createdAt) ?? 0,
    expiresAt: ms(r.expiresAt),
  };
}

/** Production loader: one indexed query for the target's candidate (level,value) pairs, global + workspace. */
export function drizzleSuppressionLoader(database: typeof defaultDb = defaultDb): SuppressionRowLoader {
  return async (target) => {
    const email = normalizeEmail(target.email);
    const domain = normalizeDomain(target.domain) ?? domainOfEmail(target.email);
    const accountKey = target.accountKey?.trim() || null; // spec 35 — verbatim identity_key

    const valueMatch = [
      email ? and(eq(suppression.level, "address"), eq(suppression.value, email)) : undefined,
      domain ? and(eq(suppression.level, "domain"), eq(suppression.value, domain)) : undefined,
      accountKey ? and(eq(suppression.level, "account"), eq(suppression.value, accountKey)) : undefined,
    ].filter(Boolean);
    if (valueMatch.length === 0) return [];

    const scopeMatch = target.tenantId
      ? or(isNull(suppression.tenantId), eq(suppression.tenantId, target.tenantId))
      : isNull(suppression.tenantId);

    // spec 35 — only ACTIVE rows suppress; a deactivated manual_dnc/existing_customer
    // simply is not loaded (no need to teach the pure module about status).
    const rows = await database
      .select()
      .from(suppression)
      .where(and(scopeMatch, eq(suppression.status, "active"), or(...valueMatch)));
    return (rows as SuppressionRow[]).map(rowToEntry);
  };
}

/**
 * Hot-path suppression check backed by the DB (fail-closed at the caller). Loads
 * candidate rows, then defers to the pure spec-22 `isSuppressed`.
 */
export async function isSuppressedDb(
  target: SuppressionTarget,
  loader: SuppressionRowLoader,
  now: number = Date.now(),
): Promise<SuppressionHit | null> {
  const rows = await loader(target);
  if (rows.length === 0) return null;
  const store = new InMemorySuppressionStore();
  for (const e of rows) store.put(suppressionKey(e.scope, e.level, e.value), e);
  return isSuppressed(target, store, now);
}

/** Boolean convenience. */
export async function suppressedDb(target: SuppressionTarget, loader: SuppressionRowLoader, now?: number): Promise<boolean> {
  return (await isSuppressedDb(target, loader, now)) !== null;
}

/** Provenance for a suppression write (spec 35 — for the audit trail). */
export interface SuppressionMeta {
  source?: string | null; // unsubscribe | resend_webhook | reply_classifier | dsar | manual_ui | migration
  createdBy?: string | null;
}

/**
 * Persist a suppression entry (idempotent upsert on scope+level+value). Used by
 * 26/27 ingestion, the manual-DNC UI, and the T0 backfill. Re-adding re-asserts
 * the suppression as ACTIVE and never weakens it (the permanence trigger blocks
 * any frozen-row weakening at the DB level). Callers should `logAudit` alongside.
 */
export async function addSuppressionDb(
  entry: SuppressionEntry,
  meta: SuppressionMeta = {},
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  const tenantId = entry.scope === GLOBAL_SCOPE ? null : entry.scope;
  await database
    .insert(suppression)
    .values({
      tenantId,
      level: entry.level,
      value: entry.value,
      type: entry.type,
      reason: entry.reason,
      permanent: entry.permanent,
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
      status: "active",
      source: meta.source ?? null,
      createdBy: meta.createdBy ?? null,
    })
    .onConflictDoUpdate({
      target: [suppression.tenantId, suppression.level, suppression.value],
      // Re-assert active; strengthen type/permanent/reason/cool-off. Setting
      // status='active' is allowed on frozen rows by the 0095 trigger.
      set: {
        type: entry.type,
        permanent: entry.permanent,
        reason: entry.reason ?? null,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
        status: "active",
        deactivatedAt: null,
        deactivatedBy: null,
        ...(meta.source ? { source: meta.source } : {}),
      },
    });
}

/** Reasons that can never be deactivated (the DB trigger enforces this too). */
const FROZEN_TYPES: ReadonlySet<string> = new Set(["opt_out", "complaint"]);

/**
 * Admin deactivation of a reversible suppression (manual_dnc / existing_customer
 * / hard_bounce). Refuses opt_out/complaint at the app layer (R4.1/R4.3) before
 * the DB trigger would; keeps the row + full history (status -> 'inactive').
 * Returns true if a row was deactivated, false if none matched.
 */
export async function deactivateSuppressionDb(
  args: { tenantId: string | null; level: SuppressionLevel; value: string; deactivatedBy?: string | null },
  database: typeof defaultDb = defaultDb,
): Promise<boolean> {
  const tenantScope = args.tenantId === null ? isNull(suppression.tenantId) : eq(suppression.tenantId, args.tenantId);
  const [row] = await database
    .select({ type: suppression.type })
    .from(suppression)
    .where(and(tenantScope, eq(suppression.level, args.level), eq(suppression.value, args.value)))
    .limit(1);
  if (!row) return false;
  if (FROZEN_TYPES.has(row.type)) {
    throw new Error("suppression_permanent_immutable");
  }
  await database
    .update(suppression)
    .set({ status: "inactive", deactivatedAt: new Date(), deactivatedBy: args.deactivatedBy ?? null })
    .where(and(tenantScope, eq(suppression.level, args.level), eq(suppression.value, args.value)));
  return true;
}

/** Read-only consent check for re-application paths (restore/import/TAM). Fail-closed. */
export async function isConsentSuppressed(
  tenantId: string,
  target: { email?: string | null; domain?: string | null; accountKey?: string | null },
  database: typeof defaultDb = defaultDb,
): Promise<boolean> {
  try {
    return await suppressedDb({ ...target, tenantId }, drizzleSuppressionLoader(database));
  } catch {
    return true; // fail-closed: treat as suppressed rather than risk re-contacting
  }
}

/** Candidate identity for batch consent filtering. */
export interface ConsentCandidate {
  email?: string | null;
  domain?: string | null;
  accountKey?: string | null;
}

/**
 * Batch variant for import/build paths: one query loads every active suppression
 * matching any candidate's (level,value), then filters in memory. Returns the
 * candidates that are NOT consent-suppressed. Fail-closed: on a query error,
 * returns [] (skip all) so a guard outage never resurrects a suppressed identity.
 */
export async function filterConsentSuppressed<T extends ConsentCandidate>(
  tenantId: string,
  candidates: T[],
  database: typeof defaultDb = defaultDb,
  now: number = Date.now(),
): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  try {
    const emails = [...new Set(candidates.map((c) => normalizeEmail(c.email)).filter((x): x is string => !!x))];
    const domains = [
      ...new Set(
        candidates
          .map((c) => normalizeDomain(c.domain) ?? domainOfEmail(c.email))
          .filter((x): x is string => !!x),
      ),
    ];
    const accountKeys = [...new Set(candidates.map((c) => c.accountKey?.trim() || null).filter((x): x is string => !!x))];

    const valueMatch = [
      emails.length ? and(eq(suppression.level, "address"), inArray(suppression.value, emails)) : undefined,
      domains.length ? and(eq(suppression.level, "domain"), inArray(suppression.value, domains)) : undefined,
      accountKeys.length ? and(eq(suppression.level, "account"), inArray(suppression.value, accountKeys)) : undefined,
    ].filter(Boolean);
    if (valueMatch.length === 0) return candidates;

    const rows = (await database
      .select()
      .from(suppression)
      .where(
        and(
          or(isNull(suppression.tenantId), eq(suppression.tenantId, tenantId)),
          eq(suppression.status, "active"),
          or(...valueMatch),
        ),
      )) as SuppressionRow[];

    const live = rows.filter((r) => r.permanent || (ms(r.expiresAt) ?? 0) > now);
    const addr = new Set(live.filter((r) => r.level === "address").map((r) => r.value));
    const dom = new Set(live.filter((r) => r.level === "domain").map((r) => r.value));
    const acct = new Set(live.filter((r) => r.level === "account").map((r) => r.value));

    return candidates.filter((c) => {
      const e = normalizeEmail(c.email);
      if (e && addr.has(e)) return false;
      const d = normalizeDomain(c.domain) ?? domainOfEmail(c.email);
      if (d && dom.has(d)) return false;
      const a = c.accountKey?.trim() || null;
      if (a && acct.has(a)) return false;
      return true;
    });
  } catch {
    return []; // fail-closed
  }
}
