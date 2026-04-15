import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "@/lib/retry";

describe("retryWithBackoff", () => {
  it("returns the value on first success — no retry, no sleep", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue(42);
    const v = await retryWithBackoff(fn, { sleep });
    expect(v).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries up to N attempts and returns the eventual success", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockResolvedValueOnce("ok");

    const v = await retryWithBackoff(fn, {
      attempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep,
      onRetry,
    });
    expect(v).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // Exponential backoff: attempt 1 fail → 10ms, attempt 2 fail → 20ms
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting attempts", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const final = new Error("final-boom");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(final);

    await expect(
      retryWithBackoff(fn, { attempts: 3, baseDelayMs: 1, sleep })
    ).rejects.toBe(final);
    expect(fn).toHaveBeenCalledTimes(3);
    // Two sleeps between three attempts
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("respects shouldRetry === false to short-circuit immediately", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err = new Error("4xx — won't retry");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, {
        attempts: 5,
        baseDelayMs: 1,
        sleep,
        shouldRetry: () => false,
      })
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("caps the per-retry delay at maxDelayMs", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockRejectedValueOnce(new Error("c"))
      .mockResolvedValueOnce("done");

    await retryWithBackoff(fn, {
      attempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 250, // would otherwise grow 100 → 200 → 400
      sleep,
    });
    expect(sleep.mock.calls).toEqual([[100], [200], [250]]);
  });

  it("treats attempts < 1 as 1 (defensive)", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue("ok");
    const v = await retryWithBackoff(fn, { attempts: 0, sleep });
    expect(v).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
