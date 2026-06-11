/**
 * Fresh user-state lookup (role + tenant) with a short in-memory cache.
 *
 * The session JWT carries the role AND tenantId minted at sign-in
 * (maxAge 8h) and the rolling refresh never re-reads the DB, so a role
 * change (promotion, demotion) or a TENANT SWITCH (invite accepted into
 * another workspace) would otherwise only apply at the next sign-in —
 * live sessions kept showing the OLD workspace's (empty) data for up to
 * 8h after accepting an invite (observed live 2026-06-11). Overlaying
 * the DB values in `getAuthContext` makes `authCtx.role` and
 * `authCtx.tenantId` authoritative within CACHE_TTL_MS across every API
 * route without a per-request query.
 *
 * Node-only: never import from the middleware — the middleware path must
 * not execute DB queries (see _specs/workspace-roles/design.md).
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 60_000;

export interface FreshUserState {
  role: string;
  tenantId: string | null;
}

const cache = new Map<string, FreshUserState & { at: number }>();

/**
 * Resolve the user's current role + tenant from the DB, cached for 60s
 * per instance. Returns `null` on any failure so the caller can fall
 * back to the JWT claims — a DB hiccup must never turn into
 * product-wide 403s or tenant flapping.
 */
export async function getFreshUserState(
  appUserId: string,
): Promise<FreshUserState | null> {
  if (!appUserId) return null;

  const hit = cache.get(appUserId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  try {
    const [row] = await db
      .select({ role: users.role, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, appUserId))
      .limit(1);
    if (!row) return null;
    const state: FreshUserState = {
      role: row.role || "member",
      tenantId: row.tenantId ?? null,
    };
    cache.set(appUserId, { ...state, at: Date.now() });
    return state;
  } catch {
    return null;
  }
}

/**
 * Back-compat role-only view of `getFreshUserState` (same cache, same
 * single query).
 */
export async function getFreshRole(appUserId: string): Promise<string | null> {
  const state = await getFreshUserState(appUserId);
  return state?.role ?? null;
}

/**
 * Drop the cached state after a role change or tenant switch so the new
 * values apply immediately on this instance (other instances converge
 * within the TTL).
 */
export function invalidateRoleCache(appUserId: string): void {
  cache.delete(appUserId);
}

/** Test hook — clears all entries. */
export function __clearRoleCacheForTests(): void {
  cache.clear();
}
