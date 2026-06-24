/**
 * Spec 14 — Postgres-backed enrollment lock (the prod CollisionLock driver).
 *
 * Why DB and not the existing Redis/InMemory impls: serverless invocations each
 * get a fresh process (InMemory can't see another instance's lock), and the
 * Upstash REST lock keys on UPSTASH_REDIS_REST_* which prod doesn't set. The DB
 * is always present and gives cross-process atomicity for free: `contact_id` is
 * the PRIMARY KEY, so the acquire upsert
 *   INSERT ... ON CONFLICT (contact_id) DO UPDATE ... WHERE expired-or-same-holder
 * lets exactly one of two racing enrollments win (AC4); a held-by-other lock
 * yields no RETURNING row, so the loser sees `false`.
 *
 * tenantId is bound at construction (RLS + audit); the CollisionLock interface
 * keys only on the globally-unique contactId.
 */

import { db as defaultDb } from "@/db";
import { enrollmentLock } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import type { CollisionLock } from "./lock";

export class DbCollisionLock implements CollisionLock {
  constructor(
    private readonly tenantId: string | null,
    private readonly database: typeof defaultDb = defaultDb,
  ) {}

  async acquire(contactId: string, enrollmentId: string, ttlMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMs));
    const rows = await this.database
      .insert(enrollmentLock)
      .values({ contactId, tenantId: this.tenantId, enrollmentId, expiresAt })
      .onConflictDoUpdate({
        target: enrollmentLock.contactId,
        set: { enrollmentId, tenantId: this.tenantId, expiresAt, acquiredAt: new Date() },
        // Reclaim ONLY if the incumbent lock has expired, or it is ours (idempotent retry).
        setWhere: sql`${enrollmentLock.expiresAt} <= now() OR ${enrollmentLock.enrollmentId} = ${enrollmentId}`,
      })
      .returning({ enrollmentId: enrollmentLock.enrollmentId });
    // A row is returned iff we inserted (was free) or updated (expired/same-holder) → we hold it.
    return rows.length > 0;
  }

  async release(contactId: string): Promise<void> {
    await this.database.delete(enrollmentLock).where(eq(enrollmentLock.contactId, contactId));
  }

  async holder(contactId: string): Promise<string | null> {
    const rows = await this.database
      .select({ e: enrollmentLock.enrollmentId })
      .from(enrollmentLock)
      .where(and(eq(enrollmentLock.contactId, contactId), gt(enrollmentLock.expiresAt, new Date())))
      .limit(1);
    return rows[0]?.e ?? null;
  }
}

/** Build the prod CollisionLock for a tenant. */
export function collisionLockForTenant(tenantId: string | null, database: typeof defaultDb = defaultDb): CollisionLock {
  return new DbCollisionLock(tenantId, database);
}
