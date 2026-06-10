/**
 * Fresh-role lookup with a short in-memory cache.
 *
 * The session JWT carries the role minted at sign-in (maxAge 8h) and the
 * rolling refresh never re-reads the DB, so a role change (promotion,
 * demotion) would otherwise only apply at the next sign-in. Overlaying
 * the DB role in `getAuthContext` makes `authCtx.role` authoritative
 * within CACHE_TTL_MS across every API route without a per-request query.
 *
 * Node-only: never import from the middleware — the middleware path must
 * not execute DB queries (see _specs/workspace-roles/design.md).
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { role: string; at: number }>();

/**
 * Resolve the user's current role from the DB, cached for 60s per
 * instance. Returns `null` on any failure so the caller can fall back
 * to the JWT role — a DB hiccup must never turn into product-wide 403s.
 */
export async function getFreshRole(appUserId: string): Promise<string | null> {
  if (!appUserId) return null;

  const hit = cache.get(appUserId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.role;

  try {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, appUserId))
      .limit(1);
    if (!row) return null;
    const role = row.role || "member";
    cache.set(appUserId, { role, at: Date.now() });
    return role;
  } catch {
    return null;
  }
}

/**
 * Drop the cached role after an admin changes it so the new role applies
 * immediately on this instance (other instances converge within the TTL).
 */
export function invalidateRoleCache(appUserId: string): void {
  cache.delete(appUserId);
}

/** Test hook — clears all entries. */
export function __clearRoleCacheForTests(): void {
  cache.clear();
}
