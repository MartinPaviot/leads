import { describe, it, expect, vi } from "vitest";
import { verifySignalUrl } from "@/lib/signals/url-verifier";

function mockFetchOk(status = 200) {
  // We can't use `new Response(null, { status: 999 })` — the Response
  // constructor enforces 200-599. We only need `.status` for the
  // verifier, so return a duck-typed minimal object.
  return vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300 });
}

function mockFetchHang() {
  // A fetch that respects AbortSignal — resolves only on abort.
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
}

function mockFetchThrow(message = "ECONNREFUSED") {
  return vi.fn().mockRejectedValue(new Error(message));
}

describe("verifySignalUrl", () => {
  it("returns verified on 2xx", async () => {
    const out = await verifySignalUrl("https://example.com/page", {
      fetchImpl: mockFetchOk(200) as typeof fetch,
    });
    expect(out.status).toBe("verified");
    expect(out.httpStatus).toBe(200);
    expect(out.reason).toBe("ok");
  });

  it("returns verified on 3xx (redirect: manual, non-loop)", async () => {
    const out = await verifySignalUrl("https://example.com/redir", {
      fetchImpl: mockFetchOk(301) as typeof fetch,
    });
    expect(out.status).toBe("verified");
    expect(out.httpStatus).toBe(301);
  });

  it("returns unverified on 404", async () => {
    const out = await verifySignalUrl("https://example.com/missing", {
      fetchImpl: mockFetchOk(404) as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.httpStatus).toBe(404);
    expect(out.reason).toBe("http_404");
  });

  it("treats LinkedIn 999 as verified (CDN block, well-formed URL)", async () => {
    const out = await verifySignalUrl(
      "https://linkedin.com/posts/some-real-post",
      { fetchImpl: mockFetchOk(999) as typeof fetch },
    );
    expect(out.status).toBe("verified");
    expect(out.reason).toBe("blocked_cdn");
  });

  it("treats X.com 403 as verified", async () => {
    const out = await verifySignalUrl("https://x.com/user/status/123", {
      fetchImpl: mockFetchOk(403) as typeof fetch,
    });
    expect(out.status).toBe("verified");
    expect(out.reason).toBe("blocked_cdn");
  });

  it("rejects malformed URLs without fetching", async () => {
    const fetchSpy = vi.fn();
    const out = await verifySignalUrl("not-a-url", {
      fetchImpl: fetchSpy as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toBe("malformed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects file:// and other unsupported protocols", async () => {
    const fetchSpy = vi.fn();
    const out = await verifySignalUrl("file:///etc/passwd", {
      fetchImpl: fetchSpy as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toMatch(/unsupported_protocol/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks localhost", async () => {
    const fetchSpy = vi.fn();
    const out = await verifySignalUrl("http://localhost/admin", {
      fetchImpl: fetchSpy as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toBe("blocked_host");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks RFC1918 private IPv4", async () => {
    const cases = [
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://127.0.0.1/",
      "http://169.254.169.254/", // AWS metadata
    ];
    for (const url of cases) {
      const out = await verifySignalUrl(url, { fetchImpl: vi.fn() as typeof fetch });
      expect(out.status).toBe("unverified");
      expect(out.reason).toBe("private_ipv4");
    }
  });

  it("blocks IPv6 loopback", async () => {
    const out = await verifySignalUrl("http://[::1]/", {
      fetchImpl: vi.fn() as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toBe("private_ipv6");
  });

  it("returns unverified with reason 'timeout' when fetch hangs past deadline", async () => {
    const out = await verifySignalUrl("https://slow.example.com/", {
      timeoutMs: 50,
      fetchImpl: mockFetchHang() as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toBe("timeout");
  });

  it("returns unverified with fetch_error reason on network throw", async () => {
    const out = await verifySignalUrl("https://gone.example.com/", {
      fetchImpl: mockFetchThrow("ENOTFOUND") as typeof fetch,
    });
    expect(out.status).toBe("unverified");
    expect(out.reason).toMatch(/^fetch_error/);
  });

  it("does not throw on any input — always resolves to a verdict", async () => {
    const inputs = ["", "//no-protocol", "javascript:alert(1)", "ftp://example.com/file"];
    for (const i of inputs) {
      const out = await verifySignalUrl(i, { fetchImpl: vi.fn() as typeof fetch });
      expect(out.status).toBe("unverified");
    }
  });
});
