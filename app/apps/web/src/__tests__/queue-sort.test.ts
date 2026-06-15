/**
 * Per-list queue ordering (T6). Pure, deterministic, order-independent.
 */
import { describe, it, expect } from "vitest";
import { sortQueueItems, ACTIVE_SORT_KEYS, type SortableQueueItem } from "@/lib/voice/queue-sort";

const items: SortableQueueItem[] = [
  { score: 50, intentScore: 0.5, attemptCount: 2, nextAttemptAt: "2026-06-10T09:00:00Z" },
  { score: 90, intentScore: 0.9, attemptCount: 0, nextAttemptAt: "2026-06-14T09:00:00Z" },
  { score: 70, intentScore: 0.7, attemptCount: 5, nextAttemptAt: null },
];

describe("sortQueueItems", () => {
  it("fit sorts by score desc (the default)", () => {
    expect(sortQueueItems(items, "fit").map((i) => i.score)).toEqual([90, 70, 50]);
  });

  it("oldest_callback puts the oldest due first, nulls last", () => {
    expect(sortQueueItems(items, "oldest_callback").map((i) => i.score)).toEqual([50, 90, 70]);
  });

  it("fewest_attempts puts the least-tried first", () => {
    expect(sortQueueItems(items, "fewest_attempts").map((i) => i.attemptCount)).toEqual([0, 2, 5]);
  });

  it("intent sorts by intentScore desc", () => {
    expect(sortQueueItems(items, "intent").map((i) => i.score)).toEqual([90, 70, 50]);
  });

  it("keys without data yet fall back to fit (never a wrong order)", () => {
    for (const k of ["accessibility", "deal_value", "local_time"] as const) {
      expect(sortQueueItems(items, k).map((i) => i.score)).toEqual([90, 70, 50]);
    }
  });

  it("does not mutate the input array", () => {
    const before = JSON.stringify(items);
    sortQueueItems(items, "fewest_attempts");
    expect(JSON.stringify(items)).toBe(before);
  });

  it("surfaces exactly the three real sort keys in the UI", () => {
    expect(ACTIVE_SORT_KEYS.map((s) => s.key)).toEqual(["fit", "oldest_callback", "fewest_attempts"]);
  });
});
