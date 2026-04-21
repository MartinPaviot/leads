import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifySources } from "@/lib/tam-stream/verify-source";
import type { Source } from "@/lib/tam-stream/events";

function makeSource(url: string, overrides: Partial<Source> = {}): Source {
  return {
    url,
    title: "t",
    fetchedAt: "2026-04-21T00:00:00Z",
    verified: false,
    ...overrides,
  };
}

describe("verifySources", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchSpy = vi.spyOn(globalThis, "fetch" as any);
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("no-ops on empty input", async () => {
    const out = await verifySources([]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks verified when HEAD returns 200", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const out = await verifySources([makeSource("https://a.example/1")]);
    expect(out).toHaveLength(1);
    expect(out[0].verified).toBe(true);
  });

  it("keeps 405 as alive (HEAD unsupported but page exists)", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 405 }));
    const out = await verifySources([makeSource("https://a.example/1")]);
    expect(out).toHaveLength(1);
    expect(out[0].verified).toBe(true);
  });

  it("accepts 301/302/307/308 redirects as alive", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 301 }))
      .mockResolvedValueOnce(new Response(null, { status: 302 }))
      .mockResolvedValueOnce(new Response(null, { status: 307 }))
      .mockResolvedValueOnce(new Response(null, { status: 308 }));
    const out = await verifySources([
      makeSource("https://a/1"),
      makeSource("https://a/2"),
      makeSource("https://a/3"),
      makeSource("https://a/4"),
    ]);
    expect(out.every((s) => s.verified)).toBe(true);
  });

  it("drops sources that 404", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    const out = await verifySources([makeSource("https://missing.example")]);
    expect(out).toEqual([]);
  });

  it("drops sources that 410", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 410 }));
    const out = await verifySources([makeSource("https://gone.example")]);
    expect(out).toEqual([]);
  });

  it("keeps 5xx but leaves verified=false", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 502 }));
    const out = await verifySources([makeSource("https://flaky.example")]);
    expect(out).toHaveLength(1);
    expect(out[0].verified).toBe(false);
  });

  it("absorbs network errors — keep source unverified, never throw", async () => {
    fetchSpy.mockRejectedValue(new Error("ENOTFOUND"));
    const out = await verifySources([makeSource("https://nope.example")]);
    expect(out).toHaveLength(1);
    expect(out[0].verified).toBe(false);
  });

  it("short-circuits already-verified sources without a HEAD call", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const preVerified = makeSource("https://ok.example", { verified: true });
    const out = await verifySources([preVerified]);
    expect(out).toEqual([preVerified]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("processes a mixed batch in parallel and preserves order of survivors", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 301 }));
    const out = await verifySources([
      makeSource("https://a/1"),
      makeSource("https://a/2"),
      makeSource("https://a/3"),
    ]);
    expect(out.map((s) => s.url)).toEqual([
      "https://a/1",
      "https://a/3",
    ]);
  });
});
