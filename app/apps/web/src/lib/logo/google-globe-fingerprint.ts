/**
 * Google Favicons V2 default-globe detection.
 *
 * Unlike V1 (`www.google.com/s2/favicons`) which returns HTTP 200 with
 * a generic globe PNG for every domain, V2 (`t2.gstatic.com/faviconV2`)
 * returns **HTTP 404** when no favicon is found. So the primary
 * rejection is status-based, not content-based.
 *
 * The byte-size constant below is a secondary safety net: if V2 ever
 * changes to return 200 for defaults, we catch it by content-length.
 *
 * Evidence: `docs/specs/logo-rendering-fix-fingerprint-evidence.md`
 * (20-domain probe, 2026-04-21).
 */

// Every 404 response in the 10-domain no-favicon probe returned exactly
// 726 bytes. Real favicons ranged 144–2468 bytes. The smallest real
// favicon observed was 144 bytes (neverssl.com, 16x16 upscaled).
export const GLOBE_DEFAULT_BYTES = 726;

// Minimum real-favicon size observed across 15 known-good probes.
// Anything below this after a 200 is suspicious but not necessarily
// a globe — could be a 1x1 tracking pixel being served as a favicon.
export const MIN_REAL_FAVICON_BYTES = 100;

export function isDefaultGlobe(status: number, bodyBytes: number): boolean {
  if (status === 404) return true;
  if (status !== 200) return true;
  if (bodyBytes === GLOBE_DEFAULT_BYTES) return true;
  if (bodyBytes < MIN_REAL_FAVICON_BYTES) return true;
  return false;
}
