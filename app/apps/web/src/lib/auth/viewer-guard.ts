/**
 * Central fail-closed write gate for the `viewer` role.
 *
 * Viewers (advisors, investors, coaches) get full READ access — shared
 * memory is the product — but must never mutate, send, or spend.
 * Rather than sprinkling `requirePermission` over ~250 write routes,
 * the middleware calls this one pure predicate for every `/api/*`
 * request. New routes are therefore viewer-safe by default.
 *
 * Pure module on purpose: zero imports, so the middleware can use it
 * regardless of runtime, and tests cover the whole truth table.
 */

/** Methods that never mutate and are always allowed. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Read-only POST surfaces a viewer legitimately uses. Prefix-matched.
 * - /api/chat            chat turn + threads + suggestions (mutation tools
 *                        are stripped inside resolveCapabilities for viewers)
 * - /api/search          global + TAM search use POST bodies for filters
 * - /api/filters/parse-nl  NL smart-filter parsing (pure compute)
 */
export const VIEWER_WRITE_ALLOWLIST: readonly string[] = [
  "/api/chat",
  "/api/search",
  "/api/filters/parse-nl",
];

/**
 * True when this request must be rejected (403) because the caller is a
 * viewer attempting a write outside the allowlist.
 *
 * Non-API paths are never blocked here: page navigations are reads, and
 * server actions are not used for mutations in this app.
 */
export function isViewerWriteBlocked(
  role: string | undefined | null,
  method: string,
  pathname: string,
): boolean {
  if (role !== "viewer") return false;
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!pathname.startsWith("/api/")) return false;
  return !VIEWER_WRITE_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
}
