import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isDefaultGlobe } from "../google-globe-fingerprint";
import { _isPathDisallowed } from "../scrape";

describe("isDefaultGlobe", () => {
  it("rejects 404 responses", () => {
    expect(isDefaultGlobe(404, 726)).toBe(true);
  });

  it("rejects non-200 status codes", () => {
    expect(isDefaultGlobe(500, 0)).toBe(true);
    expect(isDefaultGlobe(302, 0)).toBe(true);
  });

  it("rejects 200 with exact globe byte size", () => {
    expect(isDefaultGlobe(200, 726)).toBe(true);
  });

  it("rejects 200 with body smaller than minimum real favicon", () => {
    expect(isDefaultGlobe(200, 50)).toBe(true);
  });

  it("accepts 200 with real favicon sizes", () => {
    expect(isDefaultGlobe(200, 580)).toBe(false); // stripe
    expect(isDefaultGlobe(200, 2215)).toBe(false); // google
    expect(isDefaultGlobe(200, 144)).toBe(false); // neverssl (edge case)
  });
});

describe("robots.txt parser (_isPathDisallowed)", () => {
  it("allows all when no matching user-agent", () => {
    const txt = `User-agent: Googlebot\nDisallow: /\n`;
    expect(_isPathDisallowed(txt, "/", "Elevay-Logo-Resolver")).toBe(false);
  });

  it("disallows path for matching user-agent", () => {
    const txt = `User-agent: *\nDisallow: /\n`;
    expect(_isPathDisallowed(txt, "/", "Elevay-Logo-Resolver")).toBe(true);
  });

  it("allows when specific path is more specific than disallow", () => {
    const txt = `User-agent: *\nDisallow: /\nAllow: /\n`;
    // Equal length → Allow wins (RFC 9309: "If the path matches both an allow and a disallow
    // rule of the same specificity, the allow rule takes precedence" — actually per spec,
    // the most specific rule wins, and with equal length the last one wins.
    // Our implementation tracks specificity by length; equal length → the last seen wins.
    expect(_isPathDisallowed(txt, "/", "Elevay-Logo-Resolver")).toBe(false);
  });

  it("disallows when user-agent matches by partial name", () => {
    const txt = `User-agent: Elevay\nDisallow: /\n`;
    expect(_isPathDisallowed(txt, "/", "Elevay-Logo-Resolver/1.0")).toBe(true);
  });

  it("handles empty robots.txt gracefully", () => {
    expect(_isPathDisallowed("", "/", "Elevay-Logo-Resolver")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const txt = `# Comment\n\nUser-agent: *\nDisallow: /private\n`;
    expect(_isPathDisallowed(txt, "/", "Elevay-Logo-Resolver")).toBe(false);
    expect(_isPathDisallowed(txt, "/private", "Elevay-Logo-Resolver")).toBe(true);
  });
});

describe("cache", () => {
  it("memory store round-trips correctly", async () => {
    // Import dynamically so env is clean (no UPSTASH_* → memory store)
    const { getCached, setCached, isNegative, setNegative, invalidateNegative, getCachedBatch } =
      await import("../cache");

    // Positive cache
    const value = { url: "https://logo.clearbit.com/stripe.com", tier: 2, resolvedAt: new Date().toISOString() };
    await setCached("stripe.com", value);
    const cached = await getCached("stripe.com");
    expect(cached).toEqual(value);

    // Negative cache
    expect(await isNegative("dead-domain.com")).toBe(false);
    await setNegative("dead-domain.com");
    expect(await isNegative("dead-domain.com")).toBe(true);

    // Invalidation
    await invalidateNegative("dead-domain.com");
    expect(await isNegative("dead-domain.com")).toBe(false);

    // Batch
    await setCached("google.com", { url: "https://google.com/favicon.ico", tier: 4, resolvedAt: new Date().toISOString() });
    const batch = await getCachedBatch(["stripe.com", "google.com", "missing.com"]);
    expect(batch.size).toBe(2);
    expect(batch.has("stripe.com")).toBe(true);
    expect(batch.has("google.com")).toBe(true);
    expect(batch.has("missing.com")).toBe(false);
  });
});

describe("HTML logo extraction", () => {
  it("extracts apple-touch-icon", async () => {
    const { scrapeLogoFromHomepage } = await import("../scrape");
    const html = `<html><head><link rel="apple-touch-icon" href="/apple-icon-180x180.png"></head><body></body></html>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/robots.txt")) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      if (url.endsWith("/")) {
        return Promise.resolve(
          new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
        );
      }
      return Promise.resolve(new Response("", { status: 404 }));
    }) as typeof fetch;

    try {
      const result = await scrapeLogoFromHomepage("example.com");
      expect(result).toBe("https://example.com/apple-icon-180x180.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts og:image when no apple-touch-icon", async () => {
    const { scrapeLogoFromHomepage } = await import("../scrape");
    const html = `<html><head><meta property="og:image" content="https://cdn.example.com/og-logo.jpg"></head></html>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/robots.txt")) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      if (url.endsWith("/")) {
        return Promise.resolve(new Response(html, { status: 200 }));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    }) as typeof fetch;

    try {
      const result = await scrapeLogoFromHomepage("example.com");
      expect(result).toBe("https://cdn.example.com/og-logo.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts link rel=icon with preference for larger sizes", async () => {
    const { scrapeLogoFromHomepage } = await import("../scrape");
    const html = `<html><head>
      <link rel="icon" href="/favicon-16.ico" sizes="16x16">
      <link rel="icon" href="/favicon-128.png" sizes="128x128">
    </head></html>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/robots.txt")) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      if (url.endsWith("/")) {
        return Promise.resolve(new Response(html, { status: 200 }));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    }) as typeof fetch;

    try {
      const result = await scrapeLogoFromHomepage("example.com");
      expect(result).toBe("https://example.com/favicon-128.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
