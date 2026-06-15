/**
 * Per-list queue ordering (T6, _specs/call-lists). Pure + deterministic.
 *
 * Keys that need data the campaign queue doesn't carry yet (accessibility,
 * deal_value, local_time are constant / absent in todayQueue) fall back to
 * `fit` — never a wrong order, just the smart default. The UI therefore only
 * offers the keys that make a real difference today (fit / oldest_callback /
 * fewest_attempts); the rest stay in the type for a later enrichment.
 */

import type { CallListSort } from "./call-lists";

export interface SortableQueueItem {
  score: number;
  intentScore: number;
  attemptCount?: number;
  nextAttemptAt?: string | null;
}

/** Sort keys the cockpit surfaces today (the ones that reorder a real queue). */
export const ACTIVE_SORT_KEYS: ReadonlyArray<{ key: CallListSort; label: string }> = [
  { key: "fit", label: "Fit ICP" },
  { key: "oldest_callback", label: "Rappels anciens" },
  { key: "fewest_attempts", label: "Moins tentés" },
];

export function sortQueueItems<T extends SortableQueueItem>(items: T[], sort: CallListSort): T[] {
  const arr = [...items];
  switch (sort) {
    case "oldest_callback":
      // Oldest-due first; items without a due date sort last (Infinity).
      return arr.sort(
        (a, b) =>
          (a.nextAttemptAt ? Date.parse(a.nextAttemptAt) : Number.POSITIVE_INFINITY) -
          (b.nextAttemptAt ? Date.parse(b.nextAttemptAt) : Number.POSITIVE_INFINITY),
      );
    case "fewest_attempts":
      return arr.sort((a, b) => (a.attemptCount ?? 0) - (b.attemptCount ?? 0));
    case "intent":
      return arr.sort((a, b) => b.intentScore - a.intentScore);
    case "fit":
    case "accessibility":
    case "deal_value":
    case "local_time":
    default:
      return arr.sort((a, b) => b.score - a.score);
  }
}
