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
import { and, eq, isNull, or } from "drizzle-orm";
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

    const valueMatch = [
      email ? and(eq(suppression.level, "address"), eq(suppression.value, email)) : undefined,
      domain ? and(eq(suppression.level, "domain"), eq(suppression.value, domain)) : undefined,
    ].filter(Boolean);
    if (valueMatch.length === 0) return [];

    const scopeMatch = target.tenantId
      ? or(isNull(suppression.tenantId), eq(suppression.tenantId, target.tenantId))
      : isNull(suppression.tenantId);

    const rows = await database
      .select()
      .from(suppression)
      .where(and(scopeMatch, or(...valueMatch)));
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

/** Persist a suppression entry (idempotent upsert on scope+level+value). Used by 26/27 ingestion. */
export async function addSuppressionDb(entry: SuppressionEntry, database: typeof defaultDb = defaultDb): Promise<void> {
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
    })
    .onConflictDoUpdate({
      target: [suppression.tenantId, suppression.level, suppression.value],
      set: { type: entry.type, permanent: entry.permanent, reason: entry.reason ?? null, expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null },
    });
}
