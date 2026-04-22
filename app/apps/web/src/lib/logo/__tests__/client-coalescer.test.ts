import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueLogoResolve,
  __resetCoalescer,
} from "../client-coalescer";

beforeEach(() => {
  __resetCoalescer();
  vi.useFakeTimers();
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockFetch(results: Record<string, unknown>) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  });
}

function mockFetchError(status = 500) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: "fail" }),
  });
}

describe("client-coalescer", () => {
  it("debounces 50ms and flushes one batch", async () => {
    const result = {
      url: "https://logo.clearbit.com/stripe.com",
      tier: 2,
      fromCache: false,
      resolvedAt: "2026-04-22T00:00:00Z",
    };
    mockFetch({ "stripe.com": result });

    const { promise } = enqueueLogoResolve({
      domain: "stripe.com",
      companyName: "Stripe",
    });

    // Not flushed yet
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(60);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/company-logo/resolve-batch");
    expect(JSON.parse(opts.body).entries).toHaveLength(1);

    const resolved = await promise;
    expect(resolved.url).toBe("https://logo.clearbit.com/stripe.com");
    expect(resolved.tier).toBe(2);
  });

  it("deduplicates same-domain requests in one batch", async () => {
    const result = {
      url: "https://logo.clearbit.com/acme.com",
      tier: 2,
      fromCache: true,
      resolvedAt: "2026-04-22T00:00:00Z",
    };
    mockFetch({ "acme.com": result });

    const a = enqueueLogoResolve({ domain: "acme.com", companyName: "Acme" });
    const b = enqueueLogoResolve({ domain: "ACME.COM", companyName: "Acme Inc" });
    const c = enqueueLogoResolve({ domain: "acme.com", companyName: "Acme Corp" });

    await vi.advanceTimersByTimeAsync(60);

    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.entries).toHaveLength(1);

    const [ra, rb, rc] = await Promise.all([a.promise, b.promise, c.promise]);
    expect(ra.url).toBe(result.url);
    expect(rb.url).toBe(result.url);
    expect(rc.url).toBe(result.url);
  });

  it("caps batch at 50 and flushes overflow in a separate batch", async () => {
    const results: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) {
      const domain = `d${i}.com`;
      results[domain] = {
        url: null,
        tier: 6,
        fromCache: false,
        resolvedAt: "2026-04-22T00:00:00Z",
      };
    }
    mockFetch(results);

    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(
        enqueueLogoResolve({ domain: `d${i}.com`, companyName: `D${i}` }),
      );
    }

    // First flush: 50
    await vi.advanceTimersByTimeAsync(60);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(firstBody.entries).toHaveLength(50);

    // Overflow flush: 10
    await vi.advanceTimersByTimeAsync(60);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
    );
    expect(secondBody.entries).toHaveLength(10);
  });

  it("cancellation prevents resolve callback", async () => {
    mockFetch({
      "cancel.com": {
        url: "https://example.com/logo.png",
        tier: 2,
        fromCache: false,
        resolvedAt: "2026-04-22T00:00:00Z",
      },
    });

    const { promise, cancel } = enqueueLogoResolve({
      domain: "cancel.com",
      companyName: "Cancel",
    });

    cancel();
    await vi.advanceTimersByTimeAsync(60);

    // Promise should never resolve (cancelled entry skipped)
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(resolved).toBe(false);
  });

  it("rejects all pending on HTTP error", async () => {
    mockFetchError(500);

    const a = enqueueLogoResolve({ domain: "a.com", companyName: "A" });
    const b = enqueueLogoResolve({ domain: "b.com", companyName: "B" });

    // Attach rejection handlers before flushing to avoid unhandled rejection warnings
    const aResult = a.promise.catch((e: Error) => e);
    const bResult = b.promise.catch((e: Error) => e);

    await vi.advanceTimersByTimeAsync(60);

    const errA = await aResult;
    const errB = await bResult;
    expect(errA).toBeInstanceOf(Error);
    expect((errA as Error).message).toBe("Logo resolve failed: 500");
    expect(errB).toBeInstanceOf(Error);
    expect((errB as Error).message).toBe("Logo resolve failed: 500");
  });

  it("returns tier 6 fallback for domains not in response", async () => {
    mockFetch({});

    const { promise } = enqueueLogoResolve({
      domain: "missing.com",
      companyName: "Missing",
    });

    await vi.advanceTimersByTimeAsync(60);

    const result = await promise;
    expect(result.url).toBeNull();
    expect(result.tier).toBe(6);
  });

  it("rejects on network error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const { promise } = enqueueLogoResolve({
      domain: "offline.com",
      companyName: "Offline",
    });

    const result = promise.catch((e: Error) => e);

    await vi.advanceTimersByTimeAsync(60);

    const err = await result;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Network error");
  });
});
