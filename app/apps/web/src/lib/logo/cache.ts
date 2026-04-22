/**
 * Upstash-backed logo resolution cache.
 *
 * Mirrors the pattern in `lib/rate-limit-store.ts`: direct REST API
 * calls (no `@upstash/redis` dep), env-gated with an in-memory
 * fallback for local dev, fail-open so a Redis outage just means
 * redundant external fetches rather than a page error.
 *
 * Key namespaces:
 *   logo:resolved:{domain}   → JSON { url, tier, resolvedAt }
 *   logo:negative:{domain}   → "1" (domain has no resolvable logo)
 *   logo:robots:{domain}     → "allow" | "disallow"
 */

export interface CachedLogo {
  url: string | null;
  tier: number;
  resolvedAt: string;
}

const POSITIVE_TTL_SEC = 30 * 24 * 3600; // 30 days
const NEGATIVE_TTL_SEC = 24 * 3600; // 24 hours (Martin Q8)
const ROBOTS_TTL_SEC = 24 * 3600;

// ── In-memory fallback (local dev / missing env) ──

const mem = new Map<string, { value: string; expiresAt: number }>();

function memGet(key: string): string | null {
  const entry = mem.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    mem.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSec: number): void {
  mem.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function memDel(key: string): void {
  mem.delete(key);
}

function memMget(keys: string[]): (string | null)[] {
  return keys.map(memGet);
}

// ── Upstash REST driver ──

function getEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function pipeline(
  commands: unknown[][],
): Promise<unknown[]> {
  const env = getEnv();
  if (!env) throw new Error("upstash not configured");
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const parsed = (await res.json()) as Array<{
    result?: unknown;
    error?: string;
  }>;
  return parsed.map((p) => {
    if (p.error) throw new Error(`upstash cmd: ${p.error}`);
    return p.result;
  });
}

// ── Public API ──

function rkey(domain: string): string {
  return `logo:resolved:${domain.toLowerCase()}`;
}

function nkey(domain: string): string {
  return `logo:negative:${domain.toLowerCase()}`;
}

function rbkey(domain: string): string {
  return `logo:robots:${domain.toLowerCase()}`;
}

export async function getCached(domain: string): Promise<CachedLogo | null> {
  const key = rkey(domain);
  try {
    const env = getEnv();
    if (!env) {
      const raw = memGet(key);
      return raw ? (JSON.parse(raw) as CachedLogo) : null;
    }
    const [raw] = await pipeline([["GET", key]]);
    if (!raw || typeof raw !== "string") return null;
    return JSON.parse(raw) as CachedLogo;
  } catch {
    const raw = memGet(key);
    return raw ? (JSON.parse(raw) as CachedLogo) : null;
  }
}

export async function setCached(
  domain: string,
  value: CachedLogo,
): Promise<void> {
  const key = rkey(domain);
  const json = JSON.stringify(value);
  try {
    const env = getEnv();
    if (!env) {
      memSet(key, json, POSITIVE_TTL_SEC);
      return;
    }
    await pipeline([["SET", key, json, "EX", String(POSITIVE_TTL_SEC)]]);
  } catch {
    memSet(key, json, POSITIVE_TTL_SEC);
  }
}

export async function isNegative(domain: string): Promise<boolean> {
  const key = nkey(domain);
  try {
    const env = getEnv();
    if (!env) return memGet(key) === "1";
    const [raw] = await pipeline([["GET", key]]);
    return raw === "1";
  } catch {
    return memGet(key) === "1";
  }
}

export async function setNegative(domain: string): Promise<void> {
  const key = nkey(domain);
  try {
    const env = getEnv();
    if (!env) {
      memSet(key, "1", NEGATIVE_TTL_SEC);
      return;
    }
    await pipeline([["SET", key, "1", "EX", String(NEGATIVE_TTL_SEC)]]);
  } catch {
    memSet(key, "1", NEGATIVE_TTL_SEC);
  }
}

export async function invalidateNegative(domain: string): Promise<void> {
  const key = nkey(domain);
  try {
    const env = getEnv();
    if (!env) {
      memDel(key);
      return;
    }
    await pipeline([["DEL", key]]);
  } catch {
    memDel(key);
  }
}

/** Batch read for the client coalescer. Returns map keyed by domain. */
export async function getCachedBatch(
  domains: string[],
): Promise<Map<string, CachedLogo>> {
  const result = new Map<string, CachedLogo>();
  if (domains.length === 0) return result;

  const keys = domains.map(rkey);
  let values: (string | null)[];

  try {
    const env = getEnv();
    if (!env) {
      values = memMget(keys);
    } else {
      const raw = await pipeline([["MGET", ...keys]]);
      values = (raw[0] as (string | null)[]) ?? [];
    }
  } catch {
    values = memMget(keys);
  }

  for (let i = 0; i < domains.length; i++) {
    const v = values[i];
    if (v && typeof v === "string") {
      try {
        result.set(domains[i], JSON.parse(v) as CachedLogo);
      } catch {
        // corrupted entry — skip
      }
    }
  }
  return result;
}

// ── Robots.txt cache ──

export async function getRobotsCache(
  domain: string,
): Promise<"allow" | "disallow" | null> {
  const key = rbkey(domain);
  try {
    const env = getEnv();
    if (!env) return memGet(key) as "allow" | "disallow" | null;
    const [raw] = await pipeline([["GET", key]]);
    if (raw === "allow" || raw === "disallow") return raw;
    return null;
  } catch {
    return memGet(key) as "allow" | "disallow" | null;
  }
}

export async function setRobotsCache(
  domain: string,
  value: "allow" | "disallow",
): Promise<void> {
  const key = rbkey(domain);
  try {
    const env = getEnv();
    if (!env) {
      memSet(key, value, ROBOTS_TTL_SEC);
      return;
    }
    await pipeline([["SET", key, value, "EX", String(ROBOTS_TTL_SEC)]]);
  } catch {
    memSet(key, value, ROBOTS_TTL_SEC);
  }
}

export { POSITIVE_TTL_SEC, NEGATIVE_TTL_SEC, ROBOTS_TTL_SEC };
