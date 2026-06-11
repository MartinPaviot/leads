/**
 * "Select all matching" — the header checkbox on the Accounts / Contacts
 * lists selects EVERY row the active filters match, not just the loaded
 * page (the lists paginate 200/page, so a tenant with 990 contacts used
 * to get a "select all" of exactly 200).
 *
 * The list endpoints expose `?idsOnly=true`, which returns the ids for
 * the exact WHERE clause the list + its count use. This helper calls it
 * with the page's current filter params, unions the result with the ids
 * already visible (covers rows the client knows about that the server
 * doesn't yet — e.g. mid-stream TAM rows), and reports honestly when the
 * fetch failed or the server capped the id list.
 */

export interface SelectAllMatchingResult {
  /** The ids to select: server-matching ids ∪ the visible rows. */
  ids: Set<string>;
  /** Server-reported matching total; null when the fetch failed. */
  total: number | null;
  /** True when the server returned fewer ids than `total` (cap hit). */
  truncated: boolean;
  /** True when the fetch failed — `ids` falls back to the visible rows. */
  failed: boolean;
}

export async function selectAllMatchingIds(opts: {
  /** List endpoint, e.g. "/api/contacts" or "/api/accounts". */
  endpoint: string;
  /** The page's current filter params (no page/pageSize needed). */
  params: URLSearchParams;
  /** Ids of the rows currently rendered — always kept selected. */
  visibleIds: string[];
  /** Test seam. */
  fetchImpl?: typeof fetch;
}): Promise<SelectAllMatchingResult> {
  const { endpoint, params, visibleIds, fetchImpl } = opts;
  const doFetch = fetchImpl ?? fetch;
  // Copy — never mutate the caller's params object.
  const query = new URLSearchParams(params);
  query.set("idsOnly", "true");

  try {
    const res = await doFetch(`${endpoint}?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { ids?: unknown; total?: unknown };
    const fetched = Array.isArray(data.ids)
      ? (data.ids as unknown[]).filter((x): x is string => typeof x === "string")
      : null;
    if (!fetched) throw new Error("malformed idsOnly response");
    const total = typeof data.total === "number" ? data.total : fetched.length;
    return {
      ids: new Set([...visibleIds, ...fetched]),
      total,
      truncated: fetched.length < total,
      failed: false,
    };
  } catch {
    return {
      ids: new Set(visibleIds),
      total: null,
      truncated: false,
      failed: true,
    };
  }
}
