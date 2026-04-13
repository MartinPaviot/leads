import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chunkedBulkCall } from "@/lib/chunk-bulk";

describe("chunkedBulkCall", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("chunks ids at `chunkSize` and calls endpoint once per chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);

    const result = await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/enrich",
      buildPayload: (chunk) => ({ companyIds: chunk }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.total).toBe(50);
    expect(result.succeeded).toBe(50);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("reports onProgress cumulatively after every chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onProgress = vi.fn();

    const ids = Array.from({ length: 45 }, (_, i) => `id-${i}`);
    await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/enrich",
      buildPayload: (chunk) => ({ companyIds: chunk }),
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 20, 45);
    expect(onProgress).toHaveBeenNthCalledWith(2, 40, 45);
    expect(onProgress).toHaveBeenNthCalledWith(3, 45, 45);
  });

  it("collects non-2xx errors without aborting subsequent chunks", async () => {
    const responses = [
      new Response("{}", { status: 200 }),
      new Response("{}", { status: 500 }),
      new Response("{}", { status: 200 }),
    ];
    let callIdx = 0;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses[callIdx++]));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);
    const result = await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/enrich",
      buildPayload: (chunk) => ({ companyIds: chunk }),
    });

    expect(result.succeeded).toBe(40);
    expect(result.failed).toBe(20);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].chunkIndex).toBe(1);
    expect(result.errors[0].status).toBe(500);
    expect(result.errors[0].ids).toHaveLength(20);
  });

  it("captures thrown fetch errors with status=null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockRejectedValueOnce(new Error("Network down"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ids = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    const result = await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/enrich",
      buildPayload: (chunk) => ({ companyIds: chunk }),
    });

    expect(result.succeeded).toBe(20);
    expect(result.failed).toBe(20);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].status).toBeNull();
    expect(result.errors[0].err).toBeInstanceOf(Error);
  });

  it("handles id count < chunkSize with a single call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ids = ["a", "b", "c"];
    const result = await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/score",
      buildPayload: (chunk) => ({ companyIds: chunk }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(3);
  });

  it("handles empty id list without calling fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await chunkedBulkCall({
      ids: [],
      endpoint: "/api/score",
      buildPayload: (chunk) => ({ companyIds: chunk }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, errors: [] });
  });

  it("rejects chunkSize < 1", async () => {
    await expect(
      chunkedBulkCall({
        ids: ["a"],
        chunkSize: 0,
        endpoint: "/api/x",
        buildPayload: (chunk) => ({ ids: chunk }),
      })
    ).rejects.toThrow("chunkSize must be ≥ 1");
  });
});
