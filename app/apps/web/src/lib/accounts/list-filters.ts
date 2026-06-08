/**
 * Pure parsing of the accounts-list `?excluded=` query param into a mode.
 * Kept pure (no drizzle) so it unit-tests without a DB; the route maps the
 * mode to an isNull / isNotNull / no-op predicate.
 *
 *   absent | "false" | "0" → "hide"  (default — excluded accounts hidden)
 *   "true"  | "1"          → "only"  (show only excluded)
 *   "all"                  → "all"   (show both)
 */
export type ExcludedMode = "hide" | "only" | "all";

export function parseExcludedMode(param: string | null | undefined): ExcludedMode {
  const p = (param || "false").toLowerCase();
  if (p === "all") return "all";
  if (p === "true" || p === "1") return "only";
  return "hide";
}
