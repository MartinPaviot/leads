/**
 * Spec 14 — observe-phase collision persistence. The guard's `recordCollision`
 * sink (enroll-guard.ts) was console.warn-only; this makes the observe phase
 * MEASURABLE by writing each turned-away enrollment to enrollment_collision.
 * `enforced=false` rows (observe mode) are "would-have-blocked" events — the
 * founder reads their rate to decide whether to flip ANTI_COLLISION_ENFORCE on.
 *
 * Best-effort: every function swallows its own errors. A logging-table outage
 * must never affect the enrollment path (the guard already fails open).
 */

import { db as defaultDb } from "@/db";
import { enrollmentCollision } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { CollisionRecord } from "./collision";

/** Persist one collision. Never throws — the enrollment path must not depend on it. */
export async function recordCollisionRow(
  tenantId: string | null,
  record: CollisionRecord,
  enforced: boolean,
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  try {
    await database.insert(enrollmentCollision).values({
      tenantId,
      contactId: record.contactId,
      blockedEnrollmentId: record.blockedEnrollmentId,
      heldBy: record.heldBy,
      enforced,
    });
  } catch {
    /* best-effort observability; the console.warn in the guard still fires */
  }
}

export interface CollisionRow {
  id: string;
  contactId: string;
  blockedEnrollmentId: string;
  heldBy: string | null;
  enforced: boolean;
  createdAt: Date | null;
}

/** Recent collisions for a tenant (newest first), optionally since a cutoff. */
export async function getRecentCollisions(
  tenantId: string,
  opts: { sinceMs?: number; limit?: number; database?: typeof defaultDb } = {},
): Promise<CollisionRow[]> {
  const database = opts.database ?? defaultDb;
  const conds = [eq(enrollmentCollision.tenantId, tenantId)];
  if (opts.sinceMs != null) conds.push(gte(enrollmentCollision.createdAt, new Date(opts.sinceMs)));
  try {
    const rows = await database
      .select({
        id: enrollmentCollision.id,
        contactId: enrollmentCollision.contactId,
        blockedEnrollmentId: enrollmentCollision.blockedEnrollmentId,
        heldBy: enrollmentCollision.heldBy,
        enforced: enrollmentCollision.enforced,
        createdAt: enrollmentCollision.createdAt,
      })
      .from(enrollmentCollision)
      .where(and(...conds))
      .orderBy(desc(enrollmentCollision.createdAt))
      .limit(opts.limit ?? 50);
    return rows as CollisionRow[];
  } catch {
    return [];
  }
}

/** Collision counts for a tenant: total + how many would-have-blocked (observe). */
export async function countCollisions(
  tenantId: string,
  opts: { sinceMs?: number; database?: typeof defaultDb } = {},
): Promise<{ total: number; wouldHaveBlocked: number; enforced: number }> {
  const database = opts.database ?? defaultDb;
  const conds = [eq(enrollmentCollision.tenantId, tenantId)];
  if (opts.sinceMs != null) conds.push(gte(enrollmentCollision.createdAt, new Date(opts.sinceMs)));
  try {
    const [row] = await database
      .select({
        total: sql<number>`count(*)::int`,
        wouldHaveBlocked: sql<number>`count(*) filter (where ${enrollmentCollision.enforced} = false)::int`,
        enforced: sql<number>`count(*) filter (where ${enrollmentCollision.enforced} = true)::int`,
      })
      .from(enrollmentCollision)
      .where(and(...conds));
    return {
      total: Number(row?.total ?? 0),
      wouldHaveBlocked: Number(row?.wouldHaveBlocked ?? 0),
      enforced: Number(row?.enforced ?? 0),
    };
  } catch {
    return { total: 0, wouldHaveBlocked: 0, enforced: 0 };
  }
}
