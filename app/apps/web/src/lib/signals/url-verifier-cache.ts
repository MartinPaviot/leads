/**
 * Cache-backed URL verification (MONACO-PARITY-01 part 2).
 *
 * Wraps the pure `verifySignalUrl` helper with a Postgres-backed
 * lookup so we don't HEAD the same URL more than once per cache
 * window (default 7 days). The eviction job in
 * `inngest/signal-url-cache-evict.ts` removes expired rows daily.
 *
 * Why a separate file: keeping `url-verifier.ts` pure (no DB import)
 * lets the unit tests run without touching Postgres. This file is
 * the "industrial" version that production paths use.
 */

import { db } from "@/db";
import { signalUrlCache } from "@/db/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import {
  verifySignalUrl,
  type UrlVerificationOutcome,
} from "./url-verifier";

const CACHE_TTL_DAYS = 7;

/** Status sentinels mirroring the SQL schema in 0039 migration. */
const STATUS_TIMEOUT = -1;
const STATUS_DNS = -2;
const STATUS_MALFORMED = -3;
const STATUS_BLOCKED_PRIVATE = -4;

function reasonToSentinel(reason: string): number {
  if (reason === "timeout") return STATUS_TIMEOUT;
  if (reason === "malformed") return STATUS_MALFORMED;
  if (reason === "blocked_host" || reason.startsWith("private_")) {
    return STATUS_BLOCKED_PRIVATE;
  }
  if (reason.startsWith("fetch_error")) return STATUS_DNS;
  return 0;
}

/**
 * Lightweight URL canonicalisation for cache lookups. Goal: two
 * URLs that point to the same resource hash to the same cache row.
 * Drops fragment, lowercases host, strips common tracking params.
 */
export function canonicaliseUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "ref_src",
      "_hsenc",
      "_hsmi",
      "mc_cid",
      "mc_eid",
    ]);
    for (const key of Array.from(u.searchParams.keys())) {
      if (drop.has(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

// Discriminated-union ancestors can't be extended via `interface`,
// so we intersect to add the cache-hit flag without losing the
// status-narrowed branches.
export type CachedUrlVerification = UrlVerificationOutcome & {
  fromCache: boolean;
};

/**
 * Verify `rawUrl`, consulting the cache first. Cache misses run the
 * pure verifier and persist the outcome. Cache writes are
 * fire-and-forget — verification never fails because the DB write
 * threw.
 */
export async function verifySignalUrlCached(
  rawUrl: string,
): Promise<CachedUrlVerification> {
  const canonical = canonicaliseUrl(rawUrl);
  if (!canonical) {
    return {
      status: "unverified",
      httpStatus: null,
      reason: "malformed",
      fromCache: false,
    };
  }

  // Try cache. We compare expires_at server-side so a stale row
  // gets skipped without a separate cache-eviction round-trip per
  // lookup (the eviction cron handles permanent removal).
  try {
    const [cached] = await db
      .select({
        outcome: signalUrlCache.outcome,
        status: signalUrlCache.status,
        reason: signalUrlCache.reason,
      })
      .from(signalUrlCache)
      .where(
        drizzleSql`${signalUrlCache.url} = ${canonical} AND ${signalUrlCache.expiresAt} > now()`,
      )
      .limit(1);

    if (cached) {
      // Split per branch so the literal `status` narrows the
      // discriminated-union return type ; the merged-shape return
      // satisfies neither branch and TS rejects it.
      if (cached.outcome === "verified") {
        return {
          status: "verified",
          httpStatus: cached.status,
          reason: cached.reason as "ok" | "blocked_cdn",
          fromCache: true,
        };
      }
      return {
        status: "unverified",
        httpStatus: cached.status >= 0 ? cached.status : null,
        reason: cached.reason,
        fromCache: true,
      };
    }
  } catch (err) {
    // DB unreachable → fall through to live verification.
    console.warn(
      "[verifySignalUrlCached] cache lookup failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Cache miss — run the live HEAD.
  const out = await verifySignalUrl(canonical);

  // Persist outcome. UPSERT pattern via ON CONFLICT keeps the unique
  // constraint on `url` happy when two parallel verifies race.
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const statusValue = out.httpStatus ?? reasonToSentinel(out.reason);
    await db.execute(drizzleSql`
      INSERT INTO signal_url_cache (url, status, outcome, reason, expires_at)
      VALUES (${canonical}, ${statusValue}, ${out.status}, ${out.reason}, ${expiresAt})
      ON CONFLICT (url) DO UPDATE SET
        status = EXCLUDED.status,
        outcome = EXCLUDED.outcome,
        reason = EXCLUDED.reason,
        checked_at = now(),
        expires_at = EXCLUDED.expires_at
    `);
  } catch (err) {
    console.warn(
      "[verifySignalUrlCached] cache write failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return { ...out, fromCache: false };
}

/**
 * Bulk-verify a list of URLs with simple host-level concurrency
 * control (max 4 parallel HEADs across the whole batch). The cache
 * is consulted first for every entry — re-runs after a normal
 * generation cycle should be near-zero outbound traffic.
 */
export async function verifySignalUrlsBatch(
  urls: string[],
): Promise<Array<CachedUrlVerification & { url: string }>> {
  const results: Array<CachedUrlVerification & { url: string }> = [];
  const queue = [...urls];
  const concurrency = 4;

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const out = await verifySignalUrlCached(next);
      results.push({ url: next, ...out });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
