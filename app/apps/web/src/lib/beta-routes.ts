/**
 * Routes still in beta — surfaces that aren't guaranteed 100% polished yet.
 * Rendered as a small "Beta" tag in the sidebar nav and the page header so
 * expectations are set honestly per-surface.
 *
 * Verified-solid pages are intentionally ABSENT (no Beta tag): Up next (home),
 * Accounts, Contacts, Opportunities, Inbox, Chat. Everything else carries the
 * tag until it's been hardened. Single source of truth for both the sidebar
 * and PageHeader.
 */
export const BETA_ROUTES = [
  "/knowledge",
  "/skills",
  "/call-mode",
  "/sequences", // Campaigns
  "/deliverability",
  "/proposals",
  "/meetings",
  "/notes",
  "/tasks",
  "/insights",
  "/reports",
] as const;

/** True when the given pathname is (or is under) a beta route. */
export function isBetaRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return BETA_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
