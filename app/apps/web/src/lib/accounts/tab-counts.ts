/**
 * Counts shown on the Accounts filter tabs (All / Prospects / Manual).
 *
 * The server returns working-set counts that reflect the active column /
 * search / score filters but are INDEPENDENT of which tab is selected, so the
 * three badges describe how the current refinement splits across sources and
 * always satisfy `all === tam + manual`. The label in parentheses therefore
 * evolves as the user changes filters, exactly like the header total.
 */
export type AccountTab = "all" | "tam" | "manual";

export interface AccountWorkingSetCounts {
  /** All sources, reflecting the active filters (tab-independent). */
  total: number;
  /** Source = "tam" (prospects sourced into the TAM). */
  tam: number;
  /** Everything that isn't a TAM prospect (manual / imported). */
  manual: number;
}

/**
 * Resolve the count to show on each tab. The server counts are authoritative;
 * until the first response lands (`server` null) we approximate from the
 * loaded rows so the badge isn't blank — the approximation is replaced as soon
 * as the page-1 response arrives.
 */
export function deriveAccountTabCounts(
  server: AccountWorkingSetCounts | null | undefined,
  loaded: ReadonlyArray<{ isTam: boolean }>,
): Record<AccountTab, number> {
  if (server) {
    return { all: server.total, tam: server.tam, manual: server.manual };
  }
  const tam = loaded.filter((r) => r.isTam).length;
  return { all: loaded.length, tam, manual: Math.max(0, loaded.length - tam) };
}
