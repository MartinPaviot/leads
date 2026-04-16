import { describe, it, expect, vi } from "vitest";
import { safeFetch } from "@/lib/safe-fetch";

function mockResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

describe("safeFetch — happy path", () => {
  it("returns parsed JSON on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ hello: "world" }));
    const result = await safeFetch<{ hello: string }>("/x", { fetchImpl });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ hello: "world" });
  });

  it("returns undefined data on 204 No Content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.error).toBeNull();
    expect(result.data).toBeUndefined();
  });
});

describe("safeFetch — HTTP errors", () => {
  it("surfaces JSON `error` field from 4xx body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ error: "Invalid input" }, { status: 400 }),
    );
    const toast = vi.fn();
    const result = await safeFetch("/x", { fetchImpl, toast });
    expect(result.data).toBeNull();
    expect(result.error).toBe("Invalid input");
    expect(toast).toHaveBeenCalledWith("Invalid input", "error");
  });

  it("surfaces JSON `message` field when no `error`", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ message: "Forbidden" }, { status: 403 }),
    );
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.error).toBe("Forbidden");
  });

  it("falls back to status + body slice for non-JSON 5xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Boom", { status: 500 }));
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.error).toMatch(/HTTP 500/);
    expect(result.error).toMatch(/Boom/);
  });

  it("uses `errorMessage` override when set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ error: "Internal" }, { status: 500 }),
    );
    const toast = vi.fn();
    await safeFetch("/x", {
      fetchImpl,
      toast,
      errorMessage: "Failed to load X",
    });
    expect(toast).toHaveBeenCalledWith("Failed to load X", "error");
  });
});

describe("safeFetch — network errors", () => {
  it("returns error and toasts on thrown fetch", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const toast = vi.fn();
    const result = await safeFetch("/x", { fetchImpl, toast });
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/ECONNREFUSED/);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("safeFetch — silent mode", () => {
  it("does NOT call toast when silent: true, even on error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ error: "Boom" }, { status: 500 }),
    );
    const toast = vi.fn();
    const result = await safeFetch("/x", { fetchImpl, toast, silent: true });
    expect(result.error).toBe("Boom");
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("safeFetch — invalid JSON body", () => {
  it("returns an error when the response body is not parseable JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe("safeFetch — 429 rate limit (E8)", () => {
  function rateLimitResponse(body: unknown, retryAfterSec?: number): Response {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
    return new Response(JSON.stringify(body), { status: 429, headers });
  }

  it("uses a friendly copy instead of the raw backend detail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      rateLimitResponse({ error: "Too many requests. Please try again shortly." }, 30)
    );
    const toast = vi.fn();
    const result = await safeFetch("/x", { fetchImpl, toast });
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/temporary limit/i);
    expect(result.error).toMatch(/30 seconds/);
    // Warning, not error — the user didn't misuse the API.
    expect(toast).toHaveBeenCalledWith(expect.any(String), "warning");
  });

  it("falls back to 'a moment' when Retry-After is missing or unparseable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      rateLimitResponse({ error: "Slow down" })
    );
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.error).toMatch(/in a moment/);
  });

  it("says 'a few seconds' for very short Retry-After values", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      rateLimitResponse({ error: "Slow" }, 3)
    );
    const result = await safeFetch("/x", { fetchImpl });
    expect(result.error).toMatch(/a few seconds/);
  });

  it("bubbles minutes when Retry-After crosses 60 seconds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      rateLimitResponse({ error: "Slow" }, 125)
    );
    const result = await safeFetch("/x", { fetchImpl });
    // 125s → ceil(125/60) = 3 minutes
    expect(result.error).toMatch(/3 minutes/);
  });

  it("respects explicit errorMessage over the 429 copy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      rateLimitResponse({ error: "Slow" }, 30)
    );
    const toast = vi.fn();
    await safeFetch("/x", {
      fetchImpl,
      toast,
      errorMessage: "Couldn't enrich this account — try again shortly.",
    });
    expect(toast).toHaveBeenCalledWith(
      "Couldn't enrich this account — try again shortly.",
      "warning"
    );
  });
});
