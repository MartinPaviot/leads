import { describe, it, expect, vi } from "vitest";
import { selectAllMatchingIds } from "@/lib/infra/select-all-matching";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("selectAllMatchingIds", () => {
  it("fetches the endpoint with idsOnly=true plus the caller's filter params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ids: ["a", "b"], total: 2 }));
    const params = new URLSearchParams({ fGrade: "A,B", deleted: "true" });

    await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params,
      visibleIds: ["a"],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/contacts");
    expect(url.searchParams.get("idsOnly")).toBe("true");
    expect(url.searchParams.get("fGrade")).toBe("A,B");
    expect(url.searchParams.get("deleted")).toBe("true");
    // The caller's params object is copied, never mutated.
    expect(params.get("idsOnly")).toBeNull();
  });

  it("unions the fetched ids with the visible rows (deduped)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ids: ["b", "c", "d"], total: 3 }));

    const result = await selectAllMatchingIds({
      endpoint: "/api/accounts",
      params: new URLSearchParams(),
      visibleIds: ["a", "b"],
      fetchImpl,
    });

    expect(result.failed).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.total).toBe(3);
    expect([...result.ids].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("flags truncation when the server returns fewer ids than the matching total", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ids: ["a", "b"], total: 50_001 }));

    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: new URLSearchParams(),
      visibleIds: [],
      fetchImpl,
    });

    expect(result.truncated).toBe(true);
    expect(result.total).toBe(50_001);
  });

  it("falls back to the visible rows when the fetch fails (HTTP error)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));

    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: new URLSearchParams(),
      visibleIds: ["a", "b"],
      fetchImpl,
    });

    expect(result.failed).toBe(true);
    expect(result.total).toBeNull();
    expect([...result.ids].sort()).toEqual(["a", "b"]);
  });

  it("falls back to the visible rows when the fetch throws (network)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: new URLSearchParams(),
      visibleIds: ["x"],
      fetchImpl,
    });

    expect(result.failed).toBe(true);
    expect([...result.ids]).toEqual(["x"]);
  });

  it("treats a malformed response (ids not an array) as a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ids: "wat" }));

    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: new URLSearchParams(),
      visibleIds: ["a"],
      fetchImpl,
    });

    expect(result.failed).toBe(true);
    expect([...result.ids]).toEqual(["a"]);
  });

  it("drops non-string ids and defaults total to the id count when absent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ids: ["a", 7, null, "b"] }));

    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: new URLSearchParams(),
      visibleIds: [],
      fetchImpl,
    });

    expect(result.failed).toBe(false);
    expect([...result.ids].sort()).toEqual(["a", "b"]);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
  });
});
