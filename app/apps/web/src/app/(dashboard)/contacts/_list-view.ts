/**
 * Which view the /contacts list body should render. Extracted so the decision —
 * and specifically the "a failed load must not look like an empty tenant" rule —
 * is unit-testable without mounting the (large) contacts page.
 */
export type ContactsListView =
  | "loading"
  | "error"
  | "empty-fresh"
  | "empty-filtered"
  | "list";

export function contactsListView(p: {
  loading: boolean;
  listError: boolean;
  /** rows actually loaded (state), not the filtered view. */
  loadedCount: number;
  /** rows after the active search/filter. */
  filteredCount: number;
  /** whether a search or any column/smart filter is active. */
  hasActiveFilter: boolean;
}): ContactsListView {
  if (p.loading) return "loading";
  // A first-page fetch failure leaves loadedCount at 0; show a retry, never the
  // fresh-tenant "No contacts yet" import CTA (which masks the error).
  if (p.listError && p.loadedCount === 0) return "error";
  if (p.filteredCount === 0) {
    return p.hasActiveFilter ? "empty-filtered" : "empty-fresh";
  }
  return "list";
}
