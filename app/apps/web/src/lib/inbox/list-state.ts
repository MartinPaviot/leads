/**
 * F3 — the "which state" decision for the inbox list + reading pane, as two pure
 * functions so the choice is unit-testable without a DOM and cannot drift between
 * surfaces. No React, no DOM, no I/O — each returns exactly one literal of its
 * union. The ordering is load-bearing: rows always win (a background refetch never
 * blanks live rows), and a failed load is an ERROR, not an empty lane.
 */

export type ListState = "loading" | "error" | "empty" | "no-results" | "ready";

export function pickListState(i: {
  /** A foreground (non-append) load is in flight. */
  loading: boolean;
  /** The last load rejected and no rows are shown. */
  error: boolean;
  /** conversations.length currently rendered. */
  count: number;
  /** debouncedSearch is non-empty. */
  hasQuery: boolean;
}): ListState {
  if (i.count > 0) return "ready"; // R2.5 — rows win; a background load never blanks them
  if (i.loading) return "loading"; // R2.2
  if (i.error) return "error"; // R2.3 — a failed load is not an empty lane
  return i.hasQuery ? "no-results" : "empty"; // R2.4
}

export type PaneState = "none" | "loading" | "error" | "missing" | "ready";

export function pickPaneState(i: {
  /** A conversationKey is selected. */
  hasSelection: boolean;
  /** The detail fetch is in flight. */
  loading: boolean;
  /** The detail fetch rejected (network / 5xx). */
  error: boolean;
  /** The detail object is present. */
  hasDetail: boolean;
}): PaneState {
  if (!i.hasSelection) return "none"; // R4.5
  if (i.loading) return "loading"; // R4.3
  if (i.error) return "error"; // R2.7 / R4.2 — retryable, distinct from missing
  if (i.hasDetail) return "ready";
  return "missing"; // R2.7 / R4.4 — resolved-but-absent (deleted / no longer available)
}
