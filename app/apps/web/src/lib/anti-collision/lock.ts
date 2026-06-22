/**
 * Anti-collision enrollment lock (spec 14). Distinct from lib/collision/*,
 * which is multi-user *rep-attribution* awareness ("which teammate touched
 * this prospect recently"). This is a hard, atomic *enrollment* lock: a
 * contact may be in exactly ONE active sequence at a time, across every
 * campaign. The lock is the primitive; AC4 (one-winner under concurrency)
 * rides entirely on `acquire` being atomic (SET NX semantics).
 */

export interface CollisionLock {
  /**
   * Atomically claim the lock for `contactId` on behalf of `enrollmentId`.
   * Returns true iff this caller now holds it. Re-acquiring with the SAME
   * holder is idempotent (returns true) so a retried enroll never blocks
   * itself; a DIFFERENT holder is blocked (returns false). `ttlMs` is a
   * safety net so a crashed enrollment self-heals instead of wedging the
   * contact forever.
   */
  acquire(contactId: string, enrollmentId: string, ttlMs: number): Promise<boolean>;
  /** Release the lock unconditionally. Idempotent — releasing a free lock is a no-op. */
  release(contactId: string): Promise<void>;
  /** Current holder's enrollmentId, or null if free/expired. For collision diagnostics. */
  holder(contactId: string): Promise<string | null>;
}

interface Held {
  enrollmentId: string;
  expiresAt: number;
}

/**
 * Process-local lock. Backs the unit tests and single-process dev. Atomicity
 * holds because the JS event loop runs each `acquire` body to completion
 * without interleaving — two concurrent acquires resolve to exactly one
 * winner (AC4). Prod uses {@link RedisCollisionLock} for cross-process atomicity.
 */
export class InMemoryCollisionLock implements CollisionLock {
  private readonly locks = new Map<string, Held>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(contactId: string): Held | null {
    const cur = this.locks.get(contactId);
    if (!cur) return null;
    if (cur.expiresAt <= this.now()) {
      this.locks.delete(contactId);
      return null;
    }
    return cur;
  }

  async acquire(contactId: string, enrollmentId: string, ttlMs: number): Promise<boolean> {
    const cur = this.live(contactId);
    if (cur) return cur.enrollmentId === enrollmentId; // held: same holder re-acquires, others blocked
    this.locks.set(contactId, { enrollmentId, expiresAt: this.now() + ttlMs });
    return true;
  }

  async release(contactId: string): Promise<void> {
    this.locks.delete(contactId);
  }

  async holder(contactId: string): Promise<string | null> {
    return this.live(contactId)?.enrollmentId ?? null;
  }
}
