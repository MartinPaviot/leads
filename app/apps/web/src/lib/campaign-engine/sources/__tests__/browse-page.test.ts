import { describe, it, expect, vi, beforeEach } from "vitest";
import { browsePage, rootHostOf, hostInScope, isBlockedHost } from "../browse-page";

function htmlRes(
  html: string,
  opts: { url?: string; contentType?: string; ok?: boolean } = {},
) {
  const { url = "https://example.com/pricing", contentType = "text/html; charset=utf-8", ok = true } = opts;
  return {
    ok,
    url,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => html,
  };
}

describe("browse-page helpers", () => {
  it("rootHostOf strips protocol/path/www", () => {
    expect(rootHostOf("https://www.example.com/pricing")).toBe("example.com");
    expect(rootHostOf("example.com")).toBe("example.com");
  });
  it("hostInScope: root + subdomains, not other domains", () => {
    expect(hostInScope("example.com", "example.com")).toBe(true);
    expect(hostInScope("blog.example.com", "example.com")).toBe(true);
    expect(hostInScope("evil.com", "example.com")).toBe(false);
    expect(hostInScope("notexample.com", "example.com")).toBe(false);
  });
  it("isBlockedHost: loopback / private / link-local", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.1.1", "::1"]) {
      expect(isBlockedHost(h)).toBe(true);
    }
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
  });
});

describe("browsePage — fetch + guards", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("valid HTML → extracts title + same-domain internal links only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        htmlRes(
          `<title>Pricing</title><h1>Plans</h1>
           <a href="/about">About</a>
           <a href="https://example.com/customers">Customers</a>
           <a href="https://evil.com/x">External</a>
           <a href="/pricing">Self</a>`,
        ),
      ),
    );
    const out = await browsePage("example.com", "/pricing");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.page.title).toBe("Pricing");
      expect(out.page.internalLinks).toContain("https://example.com/about");
      expect(out.page.internalLinks).toContain("https://example.com/customers");
      expect(out.page.internalLinks.some((l) => l.includes("evil.com"))).toBe(false);
      expect(out.page.internalLinks.some((l) => l.endsWith("/pricing"))).toBe(false); // self excluded
    }
  });

  it("off-domain target → out_of_scope, no fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const out = await browsePage("example.com", "https://evil.com/x");
    expect(out).toEqual({ ok: false, error: "out_of_scope" });
    expect(f).not.toHaveBeenCalled();
  });

  it("private-IP target → blocked_host, no fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const out = await browsePage("example.com", "http://10.0.0.1/admin");
    expect(out).toEqual({ ok: false, error: "blocked_host" });
    expect(f).not.toHaveBeenCalled();
  });

  it("non-HTML content-type → not_html", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlRes("{}", { contentType: "application/json" })));
    const out = await browsePage("example.com", "/api/data");
    expect(out).toEqual({ ok: false, error: "not_html" });
  });

  it("cross-domain redirect (res.url off-domain) → out_of_scope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlRes("<title>Evil</title>", { url: "https://evil.com/landed" })));
    const out = await browsePage("example.com", "/redirect");
    expect(out).toEqual({ ok: false, error: "out_of_scope" });
  });
});
