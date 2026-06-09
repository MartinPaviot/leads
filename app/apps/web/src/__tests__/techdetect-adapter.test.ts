import { describe, it, expect, vi, afterEach } from "vitest";
import { techdetectCompanyEnrichmentProvider as provider } from "@/lib/providers/company-enrichment/techdetect-adapter";

function htmlResponse(html: string, headers: Record<string, string> = {}): Response {
  return { ok: true, status: 200, text: async () => html, headers: new Headers(headers) } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("techdetect provider", () => {
  it("fills technologies from the real homepage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        htmlResponse(
          '<script src="https://js.hs-scripts.com/1.js"></script><meta name="generator" content="WordPress 6.5">',
        ),
      ),
    );
    const r = await provider.enrich({ domain: "fondation-x.ch" }, { tenantId: "t1" });
    expect(r.ok).toBe(true);
    expect(r.data?.technologies).toEqual(expect.arrayContaining(["HubSpot", "WordPress"]));
    expect(r.costCents).toBe(0);
  });

  it("fails closed without a domain (never fabricates)", async () => {
    const r = await provider.enrich({}, { tenantId: "t1" });
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });

  it("returns not-found when nothing is detected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse("<html>rien d'identifiable</html>")));
    const r = await provider.enrich({ domain: "x.ch" }, { tenantId: "t1" });
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });

  it("is keyless — always available, zero cost", () => {
    expect(provider.isAvailable()).toBe(true);
    expect(provider.costCentsPerCall).toBe(0);
  });
});
