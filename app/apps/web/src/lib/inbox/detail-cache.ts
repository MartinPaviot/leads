/**
 * Client-side prefetch cache for conversation detail (INBOX-K04). Warming the
 * cache on row hover / when a neighbour becomes reachable by j/k makes the
 * reading pane render instantly instead of waiting on a round-trip.
 *
 * Module-level on purpose: the list (which warms it on hover) and the pane
 * (which drains it on select) are sibling components with no shared store.
 * Entries expire so a thread that changed server-side isn't shown stale forever;
 * the pane still owns the authoritative fetch on a miss.
 */

const TTL_MS = 30_000;

type Entry = { at: number; promise: Promise<unknown> };

const cache = new Map<string, Entry>();

export type DetailFetcher = (key: string) => Promise<unknown>;

const defaultFetcher: DetailFetcher = (key) =>
  fetch(`/api/inbox/conversations/detail?key=${encodeURIComponent(key)}`).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
  );

/**
 * Warm the cache for `key`. No-ops while a fresh entry exists (so repeated
 * hovers don't refetch). A rejected fetch evicts itself so the next attempt
 * retries rather than caching the failure.
 */
export function prefetchDetail(key: string, fetcher: DetailFetcher = defaultFetcher): void {
  if (!key) return;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  const promise = fetcher(key).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), promise });
}

/**
 * Return the warmed promise for `key` if still fresh, else undefined (the caller
 * fetches). Stale entries are evicted on read.
 */
export function takeCachedDetail(key: string): Promise<unknown> | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.promise;
}

/** Test-only reset. */
export function _resetDetailCache(): void {
  cache.clear();
}
