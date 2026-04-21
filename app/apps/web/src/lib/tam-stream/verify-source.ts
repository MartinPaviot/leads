import type { Source } from "@/lib/tam-stream/events";

/**
 * HEAD-check every source URL in parallel with a tight timeout and
 * set `verified` accordingly. Never throws — network failures are
 * absorbed as `verified: false`.
 *
 * Kept small and stateless so it can run in the Edge Runtime of the
 * streaming route. The 800ms timeout is a trade-off: long enough to
 * tolerate Crunchbase/YC latency, short enough that 4 HEAD-checks in
 * parallel add at most ~1s to the per-company pipeline.
 *
 * Some origins (Crunchbase in particular) respond 405/403 to HEAD
 * but 200 to GET. We treat 3xx/200–299 as verified, and 405 as
 * "HEAD not supported" — not a 404, so we leave verified=false
 * but keep the URL in sources rather than drop it.
 */

const HEAD_TIMEOUT_MS = 800;
// Responses that are definitely "alive" — includes 405 because some
// origins reject HEAD but serve the page on GET. A 404/410 drops
// the source.
const ALIVE_STATUSES = new Set([200, 201, 301, 302, 303, 307, 308, 405]);
const DEAD_STATUSES = new Set([404, 410]);

export async function verifySources(sources: Source[]): Promise<Source[]> {
  if (sources.length === 0) return sources;

  const checked = await Promise.all(
    sources.map(async (s) => {
      if (s.verified) return s;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
      try {
        const res = await fetch(s.url, {
          method: "HEAD",
          signal: ctrl.signal,
          redirect: "manual",
          // Some origins require a browser-ish UA to serve anything.
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; LeadSens/1.0; +https://leadsens.app)",
          },
        });
        clearTimeout(timeout);
        if (ALIVE_STATUSES.has(res.status)) {
          return { ...s, verified: true };
        }
        if (DEAD_STATUSES.has(res.status)) {
          return null; // drop
        }
        return s; // other 4xx/5xx: keep but unverified
      } catch {
        clearTimeout(timeout);
        return s; // network error, timeout: keep but unverified
      }
    }),
  );

  return checked.filter((x): x is Source => x !== null);
}
