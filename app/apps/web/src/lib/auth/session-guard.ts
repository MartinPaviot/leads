/**
 * SOC2 T5/T7 — server-side session revocation on top of stateless JWTs.
 *
 * JWT sessions live up to 8h with no server-side state, so on their own
 * a removed member or a stolen-then-password-rotated session stays valid
 * until expiry. This guard closes both holes at the `getAuthContext`
 * chokepoint:
 *   - `users.deactivated_at` set  -> every request is rejected (offboarding)
 *   - token issued before `auth_user.password_changed_at` -> rejected
 *     (password change/reset revokes all pre-existing sessions)
 *
 * One small DB read per user per 60s (in-memory TTL cache), so the
 * common path stays cheap while revocation takes effect within a minute
 * across instances — and instantly on the instance that performed the
 * change via `invalidateSessionGuard`.
 *
 * Failure mode: if the lookup throws (DB blip) we fail OPEN and let the
 * request through — the request's real data queries hit the same DB and
 * fail anyway, whereas failing closed here would turn any transient
 * blip into a full signed-out outage.
 */

import { db } from "@/db";
import { users, authUsers } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SessionGuardState {
  deactivatedAt: Date | null;
  passwordChangedAt: Date | null;
}

const TTL_MS = 60_000;
const cache = new Map<string, SessionGuardState & { fetchedAt: number }>();

export async function getSessionGuard(
  authUserId: string,
): Promise<SessionGuardState> {
  const hit = cache.get(authUserId);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;

  try {
    const [row] = await db
      .select({
        deactivatedAt: users.deactivatedAt,
        passwordChangedAt: authUsers.passwordChangedAt,
      })
      .from(authUsers)
      .leftJoin(users, eq(users.clerkId, authUsers.id))
      .where(eq(authUsers.id, authUserId))
      .limit(1);

    const state = {
      deactivatedAt: row?.deactivatedAt ?? null,
      passwordChangedAt: row?.passwordChangedAt ?? null,
      fetchedAt: Date.now(),
    };
    cache.set(authUserId, state);
    return state;
  } catch (err) {
    console.error("session-guard: lookup failed (failing open)", err);
    return hit ?? { deactivatedAt: null, passwordChangedAt: null };
  }
}

/** Drop the cached state so a deactivation / password change bites
 *  immediately on this instance instead of after the 60s TTL. */
export function invalidateSessionGuard(authUserId: string): void {
  cache.delete(authUserId);
}

/** True when a token issued at `issuedAtSec` (JWT `iat`, seconds) predates
 *  the user's last password change. */
export function isTokenPredatingPasswordChange(
  issuedAtSec: number | undefined,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt || !issuedAtSec) return false;
  return issuedAtSec * 1000 < passwordChangedAt.getTime();
}
