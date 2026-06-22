import { describe, it, expect, vi } from "vitest";
import { withTimeout } from "@/lib/utils/with-timeout";

describe("withTimeout — fail-open", () => {
  it("resolves the value when the promise wins", async () => {
    expect(await withTimeout(Promise.resolve("ok"), 1000)).toBe("ok");
  });

  it("returns null when the promise rejects", async () => {
    expect(await withTimeout(Promise.reject(new Error("boom")), 1000)).toBeNull();
  });

  it("returns null when the timeout wins", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const p = withTimeout(never, 8000);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
