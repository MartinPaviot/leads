import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("snitcherProvider", () => {
  it("isAvailable returns false when SNITCHER_API_KEY is not set", async () => {
    delete process.env.SNITCHER_API_KEY;
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    expect(snitcherProvider.isAvailable()).toBe(false);
  });

  it("isAvailable returns true when SNITCHER_API_KEY is set", async () => {
    process.env.SNITCHER_API_KEY = "test-key";
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    expect(snitcherProvider.isAvailable()).toBe(true);
  });

  it("identify returns null when no API key is set (gracefully)", async () => {
    delete process.env.SNITCHER_API_KEY;
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    const out = await snitcherProvider.identify({ ip: "8.8.8.8" });
    expect(out).toBeNull();
  });

  it("identify parses a successful response into VisitorIdResult", async () => {
    process.env.SNITCHER_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        company: {
          domain: "ACME.com",
          name: "Acme Inc.",
          confidence: 0.92,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    const out = await snitcherProvider.identify({ ip: "8.8.8.8" });
    expect(out).toEqual({
      companyDomain: "acme.com", // lowercased
      companyName: "Acme Inc.",
      confidence: 0.92,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const callUrl = String(fetchSpy.mock.calls[0][0]);
    expect(callUrl).toContain("ip=8.8.8.8");
  });

  it("identify returns null on 404 (no match)", async () => {
    process.env.SNITCHER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    const out = await snitcherProvider.identify({ ip: "8.8.8.8" });
    expect(out).toBeNull();
  });

  it("identify returns null on network error", async () => {
    process.env.SNITCHER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ENOTFOUND")),
    );
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    const out = await snitcherProvider.identify({ ip: "8.8.8.8" });
    expect(out).toBeNull();
  });

  it("identify returns null when company.domain is missing", async () => {
    process.env.SNITCHER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ company: { name: "Acme" } }),
      }),
    );
    const { snitcherProvider } = await import("@/lib/visitor-id/snitcher");
    const out = await snitcherProvider.identify({ ip: "8.8.8.8" });
    expect(out).toBeNull();
  });

  it("getVisitorIdProvider returns the snitcher provider by default", async () => {
    const { getVisitorIdProvider, snitcherProvider } = await import(
      "@/lib/visitor-id/snitcher"
    );
    expect(getVisitorIdProvider()).toBe(snitcherProvider);
  });
});
