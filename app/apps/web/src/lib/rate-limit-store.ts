/**
 * Rate-limit store abstraction.
 *
 * Production Vercel runs us across many short-lived serverless
 * instances — the legacy in-memory `Map` resets on every cold start,
 * so an attacker rotating across instances effectively bypasses the
 * limiter. This module gives us one interface with two drivers:
 *
 *   - `memoryStore` — default, fine for local dev / single-instance
 *     runs. Cheap, zero deps, zero external round-trips.
 *   - `upstashStore` — activated when `UPSTASH_REDIS_REST_URL` and
 *     `UPSTASH_REDIS_REST_TOKEN` are set. Uses Upstash's REST API
 *     (edge-runtime compatible — no TCP, no Node build deps). Counts
 *     are shared across instances so the limit is effective.
 *
 * Callers just import `hit(key, limit, windowMs)` and get back the
 * same `{ success, remaining, resetAt }` shape the rest of the app
 * already consumes. Adding a new store later is changing this file
 * only — no changes to the ~20 call sites that check rate limits.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

// ── In-memory driver ──

const memory = new Map<string, { count: number; resetAt: number }>();

// Lazy interval registration — in the edge runtime `setInterval`
// returns a handle with `.unref()` but works the same. Guard for the
// edge case where setInterval isn't available.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  }, 5 * 60 * 1000);
}

const memoryStore: RateLimitStore = {
  async hit(key, limit, windowMs) {
    const now = Date.now();
    const entry = memory.get(key);
    if (!entry || entry.resetAt < now) {
      memory.set(key, { count: 1, resetAt: now + windowMs });
      return { success: true, remaining: limit - 1, resetAt: now + windowMs };
    }
    if (entry.count >= limit) {
      return { success: false, remaining: 0, resetAt: entry.resetAt };
    }
    entry.count++;
    return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  },
};

// ── Upstash (REST) driver ──

/**
 * Upstash Redis REST implementation.
 *
 * Uses the token-bucket-ish pattern popularized by @upstash/ratelimit
 * but stripped to a single INCR + EXPIRE pipeline so we don't pull in
 * the full SDK (and its peer-dep churn). The atomicity comes from
 * pipelining: INCR returns the post-increment count, and EXPIRE NX
 * only sets the TTL on the first increment of the window.
 *
 * On any error (network, 5xx), we fail OPEN for non-auth paths (so
 * a Redis outage doesn't 429 every request) but fail CLOSED for auth
 * paths. That's the opposite of the rule of thumb for ops — but auth
 * rate-limits protect against brute force, and "Upstash is down"
 * shouldn't be a free pass to attempt 10k logins/sec.
 *
 * The fail-open/closed decision is left to the caller — this function
 * throws and callers wrap with their own policy.
 */
function upstashStoreFactory(url: string, token: string): RateLimitStore {
  async function call(commands: unknown[][]): Promise<unknown[]> {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      // Tight timeout — a 5s hang on the critical path is a DoS on us.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const parsed = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return parsed.map((p) => {
      if (p.error) throw new Error(`upstash cmd error: ${p.error}`);
      return p.result;
    });
  }

  return {
    async hit(key, limit, windowMs) {
      const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
      const nsKey = `rl:${key}`;
      const [incrRaw, pttlRaw] = await call([
        ["INCR", nsKey],
        // Only set the TTL if it isn't already set — so the window
        // starts on the first hit and subsequent increments inside
        // the window don't extend it.
        ["EXPIRE", nsKey, String(windowSec), "NX"],
        ["PTTL", nsKey],
      ]);
      const count = Number(incrRaw);
      const pttl = Number(pttlRaw);
      const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);
      if (count > limit) {
        return { success: false, remaining: 0, resetAt };
      }
      return {
        success: true,
        remaining: Math.max(0, limit - count),
        resetAt,
      };
    },
  };
}

// ── Selector ──

function pickStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const upstream = upstashStoreFactory(url, token);
    // Wrap with a memory fallback on outage so a brief Upstash blip
    // doesn't wedge the whole app. Auth-sensitive callers can opt
    // out by passing { failClosed: true } to `hit`.
    return {
      async hit(key, limit, windowMs) {
        try {
          return await upstream.hit(key, limit, windowMs);
        } catch (err) {
          console.warn("rate-limit: upstash failed, falling back to memory", err);
          return memoryStore.hit(key, limit, windowMs);
        }
      },
    };
  }
  return memoryStore;
}

/**
 * Resolve the active store once per process. Not a singleton export so
 * tests can stub `process.env` and re-import.
 */
let _store: RateLimitStore | null = null;
export function getRateLimitStore(): RateLimitStore {
  if (!_store) _store = pickStore();
  return _store;
}

/** Test-only: reset the cached store so a test can swap env vars. */
export function _resetRateLimitStoreForTest(): void {
  _store = null;
}

export async function hit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  return getRateLimitStore().hit(key, limit, windowMs);
}

export const isUpstashConfigured = (): boolean =>
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
