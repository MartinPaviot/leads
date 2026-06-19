import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  prefetchDetail,
  takeCachedDetail,
  _resetDetailCache,
} from "@/lib/inbox/detail-cache";

beforeEach(() => {
  _resetDetailCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-18T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("conversation detail prefetch cache (INBOX-K04)", () => {
  it("fetches once per key and serves the same warmed promise", async () => {
    const fetcher = vi.fn(async (key: string) => ({ key }));
    prefetchDetail("abc", fetcher);
    prefetchDetail("abc", fetcher); // repeated hover — must not refetch
    expect(fetcher).toHaveBeenCalledTimes(1);

    const cached = takeCachedDetail("abc");
    expect(cached).toBeDefined();
    await expect(cached).resolves.toEqual({ key: "abc" });
  });

  it("returns undefined for an un-warmed key", () => {
    expect(takeCachedDetail("never")).toBeUndefined();
  });

  it("expires entries past the TTL", () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    prefetchDetail("k", fetcher);
    expect(takeCachedDetail("k")).toBeDefined();
    vi.advanceTimersByTime(30_001);
    expect(takeCachedDetail("k")).toBeUndefined();
  });

  it("evicts a failed prefetch so the next attempt retries", async () => {
    const failing = vi.fn(async () => {
      throw new Error("500");
    });
    prefetchDetail("bad", failing);
    const p = takeCachedDetail("bad");
    await expect(p).rejects.toThrow("500");
    // self-evicted on rejection → a fresh warm refetches
    const ok = vi.fn(async () => ({ ok: true }));
    prefetchDetail("bad", ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("ignores an empty key", () => {
    const fetcher = vi.fn(async () => ({}));
    prefetchDetail("", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
