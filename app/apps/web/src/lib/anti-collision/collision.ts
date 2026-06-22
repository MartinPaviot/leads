/**
 * Anti-collision policy (spec 14) over an injected {@link CollisionLock}.
 *
 *  - AC1: `acquireEnrollmentLock` claims the lock at enroll; a blocked claim
 *    records a collision (so the conflict is observable, not silently dropped).
 *  - AC3: `releaseEnrollmentLock` frees it on complete / reply / opt-out.
 *  - AC2: `detectAccountOverlap` flags accounts hit by >1 active campaign.
 *  - AC4: one-winner concurrency is delegated to the lock's atomic `acquire`.
 *
 * Everything here is pure orchestration over the injected lock + recorder, so
 * it unit-tests with InMemoryCollisionLock and ships with no schema change.
 */

import type { CollisionLock } from "./lock";

/** Default lock TTL: 30 days — long enough to outlast any live sequence, short
 * enough that a contact whose enrollment crashed without releasing self-heals. */
export const DEFAULT_LOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CollisionRecord {
  contactId: string;
  /** The enrollment that was turned away. */
  blockedEnrollmentId: string;
  /** The enrollment currently holding the contact (null if it expired between acquire and read). */
  heldBy: string | null;
  atMs: number;
}

export interface AntiCollisionDeps {
  lock: CollisionLock;
  ttlMs?: number;
  /** Sink for blocked-enroll collisions (audit row, metric, Slack ping...). */
  recordCollision?: (record: CollisionRecord) => void | Promise<void>;
  now?: () => number;
}

/**
 * AC1 + AC4. Try to claim `contactId` for `enrollmentId`. Returns true iff the
 * caller may enroll. On a block, fires `recordCollision` with the incumbent
 * holder so the collision is captured before the caller bails.
 */
export async function acquireEnrollmentLock(
  contactId: string,
  enrollmentId: string,
  deps: AntiCollisionDeps,
): Promise<boolean> {
  const ttl = deps.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const won = await deps.lock.acquire(contactId, enrollmentId, ttl);
  if (!won) {
    const now = deps.now ?? (() => Date.now());
    const heldBy = await deps.lock.holder(contactId);
    await deps.recordCollision?.({ contactId, blockedEnrollmentId: enrollmentId, heldBy, atMs: now() });
  }
  return won;
}

/** AC3. Release the contact's lock. Idempotent — safe to call on any terminal
 * enrollment event (completed / replied / opted-out) without first checking. */
export function releaseEnrollmentLock(contactId: string, deps: Pick<AntiCollisionDeps, "lock">): Promise<void> {
  return deps.lock.release(contactId);
}

export interface ActiveEnrollment {
  accountId: string;
  campaignId: string;
}

export interface AccountOverlap {
  accountId: string;
  /** Distinct active campaigns touching this account, sorted. */
  campaignIds: string[];
}

/**
 * AC2. Group active enrollments by account and surface accounts that >1
 * distinct campaign is currently working. Pure; deterministic order
 * (accounts and campaignIds both sorted) so the output diffs cleanly.
 */
export function detectAccountOverlap(active: ActiveEnrollment[]): AccountOverlap[] {
  const byAccount = new Map<string, Set<string>>();
  for (const e of active) {
    let set = byAccount.get(e.accountId);
    if (!set) byAccount.set(e.accountId, (set = new Set()));
    set.add(e.campaignId);
  }
  return [...byAccount.entries()]
    .filter(([, campaigns]) => campaigns.size > 1)
    .map(([accountId, campaigns]) => ({ accountId, campaignIds: [...campaigns].sort() }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}
