/**
 * Cross-process enrollment lock backed by Upstash Redis REST (spec 14, prod
 * driver). Mirrors lib/infra/rate-limit-store.ts: same `/pipeline` endpoint,
 * same Bearer auth, same 1.5s timeout, same `UPSTASH_REDIS_REST_*` env vars.
 *
 * Atomicity (AC4) is `SET key val NX PX ttl`: Redis sets-and-returns-OK only
 * if the key was absent, so two instances racing to enroll the same contact
 * get exactly one "OK". A loser re-reads the holder and, if it turns out to be
 * itself (idempotent retry), still reports success.
 */

import type { CollisionLock } from "./lock";

const KEY_PREFIX = "enrlock:";

export class RedisCollisionLock implements CollisionLock {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async call(commands: unknown[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const parsed = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return parsed.map((p) => {
      if (p.error) throw new Error(`upstash cmd error: ${p.error}`);
      return p.result;
    });
  }

  async acquire(contactId: string, enrollmentId: string, ttlMs: number): Promise<boolean> {
    const key = KEY_PREFIX + contactId;
    const px = Math.max(1, Math.round(ttlMs));
    const [setRaw] = await this.call([["SET", key, enrollmentId, "NX", "PX", String(px)]]);
    if (setRaw === "OK") return true;
    // Lost the race (or retrying): we only hold it if WE are the holder.
    return (await this.holder(contactId)) === enrollmentId;
  }

  async release(contactId: string): Promise<void> {
    await this.call([["DEL", KEY_PREFIX + contactId]]);
  }

  async holder(contactId: string): Promise<string | null> {
    const [raw] = await this.call([["GET", KEY_PREFIX + contactId]]);
    return raw == null ? null : String(raw);
  }
}

/** Build the prod lock when Upstash is configured, else null (caller falls back to in-memory). */
export function redisCollisionLockFromEnv(): RedisCollisionLock | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new RedisCollisionLock(url, token) : null;
}
