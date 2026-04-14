import { expect, test } from "@playwright/test";

/**
 * BUGFIX-07 T8 — engagement webhooks + tracking endpoints.
 *
 * Covers the public-surface tracking endpoints that run in-process
 * without third-party signatures:
 *   - GET /api/track/open returns a transparent GIF + 200
 *   - GET /api/track/click with a valid URL returns a 302 redirect
 *   - GET /api/track/click with a `javascript:` URL redirects to /
 *   - GET /api/unsubscribe with missing params still returns HTML
 *
 * The Svix-signed /api/webhooks/resend verification path is skipped
 * below because it needs a test signing secret wired into both the
 * dev env and the test. That's a separate infra task.
 */
test.describe("engagement tracking endpoints", () => {
  test("GET /api/track/open returns a transparent GIF + 200", async ({ request }) => {
    const res = await request.get("/api/track/open?id=e2e-bogus");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/gif");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(0);
    // GIF89a header — the stored pixel is "GIF89a" as the first 6 bytes.
    expect(body.slice(0, 3).toString("ascii")).toBe("GIF");
  });

  test("GET /api/track/click redirects to a valid https target", async ({ request }) => {
    const target = encodeURIComponent("https://example.com/landing");
    const res = await request.get(`/api/track/click?id=e2e-bogus&url=${target}`, {
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(res.status());
    const location = res.headers()["location"];
    expect(location).toContain("example.com");
  });

  test("GET /api/track/click blocks javascript: scheme", async ({ request }) => {
    const target = encodeURIComponent("javascript:alert(1)");
    const res = await request.get(`/api/track/click?id=e2e-bogus&url=${target}`, {
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(res.status());
    const location = res.headers()["location"];
    // Should redirect to the homepage, NOT to the javascript: URL.
    expect(location).not.toMatch(/^javascript:/i);
  });

  test("GET /api/unsubscribe with missing params returns HTML", async ({ request }) => {
    const res = await request.get("/api/unsubscribe");
    expect(res.status()).toBeGreaterThanOrEqual(200);
    expect(res.headers()["content-type"]).toContain("text/html");
  });
});

test.describe("webhook signature verification", () => {
  test.skip(
    "POST /api/webhooks/resend rejects unsigned payloads with 401",
    // Requires the RESEND_WEBHOOK_SECRET env var to be set in the
    // webServer config AND a way to generate valid Svix signatures
    // in-test. Unskip once we add a test-only signing helper.
    async () => {
      // placeholder
    }
  );
});
