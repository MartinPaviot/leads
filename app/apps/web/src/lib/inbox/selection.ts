/**
 * Multi-select reducer for bulk keyboard triage (INBOX-T09). Pure + unit-tested.
 *
 * Models the selection state behind `x` (toggle), `Shift+j/k` / shift-click
 * (range), select-all (capped), and Esc (clear), plus a summary of a bulk
 * action's per-key results. The UI bar, keyboard wiring, and the
 * `/api/inbox/triage/bulk` fan-out are the wiring on top (residual).
 */

export interface SelectionState {
  /** Selected conversation keys (deduped). */
  keys: string[];
  /** The pivot for range selection (last single toggle / range end). */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { keys: [], anchor: null };

export function toggle(state: SelectionState, key: string): SelectionState {
  const set = new Set(state.keys);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return { keys: [...set], anchor: key };
}

/** Shift-select from the anchor to `target` over the visible ordering (inclusive). */
export function rangeTo(state: SelectionState, ordered: string[], target: string): SelectionState {
  const anchor = state.anchor ?? target;
  const ai = ordered.indexOf(anchor);
  const ti = ordered.indexOf(target);
  if (ai < 0 || ti < 0) return toggle(state, target);
  const [lo, hi] = ai <= ti ? [ai, ti] : [ti, ai];
  const set = new Set(state.keys);
  for (let i = lo; i <= hi; i++) set.add(ordered[i]);
  return { keys: [...set], anchor };
}

export function selectAll(ordered: string[], cap = 50_000): SelectionState {
  const keys = ordered.slice(0, cap);
  return { keys, anchor: keys[keys.length - 1] ?? null };
}

export function clearSelection(): SelectionState {
  return { keys: [], anchor: null };
}

export function isSelected(state: SelectionState, key: string): boolean {
  return state.keys.includes(key);
}

export interface BulkResult {
  key: string;
  ok: boolean;
}

/** Summarize a bulk action — applied count + the keys that failed (never silent). */
export function summarizeBulk(results: BulkResult[]): { applied: number; failed: string[] } {
  const failed = results.filter((r) => !r.ok).map((r) => r.key);
  return { applied: results.length - failed.length, failed };
}
