import { describe, expect, it } from "vitest";
import { detectFromHtmlAndHeaders } from "@/lib/enrichment/techstack-detect";

describe("enrichment/techstack-detect", () => {
  it("detects Stripe + Google Analytics from HTML", () => {
    const html = `
      <!doctype html><html><head>
        <script src="https://js.stripe.com/v3/"></script>
        <script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>
      </head></html>`;
    expect(detectFromHtmlAndHeaders(html, {})).toEqual(
      expect.arrayContaining(["Stripe", "Google Analytics"]),
    );
  });

  it("detects Next.js from script path", () => {
    const html = `<script src="/_next/static/chunks/main.js"></script>`;
    expect(detectFromHtmlAndHeaders(html, {})).toContain("Next.js");
  });

  it("detects Vercel from headers", () => {
    expect(
      detectFromHtmlAndHeaders("", {
        server: "Vercel",
        "x-vercel-id": "cdg1::x",
      }),
    ).toContain("Vercel");
  });

  it("detects Cloudflare from cf-ray header", () => {
    expect(detectFromHtmlAndHeaders("", { "cf-ray": "abc-123" })).toContain("Cloudflare");
  });

  it("detects Intercom widget script", () => {
    const html = `<script>(function(){var w=window;var ic=w.Intercom;</script><script src="https://widget.intercom.io/widget/abc"></script>`;
    expect(detectFromHtmlAndHeaders(html, {})).toContain("Intercom");
  });

  it("detects HubSpot analytics", () => {
    const html = `<script src="//js.hs-scripts.com/12345.js"></script>`;
    expect(detectFromHtmlAndHeaders(html, {})).toContain("HubSpot");
  });

  it("detects multiple technologies together", () => {
    const html = `
      <script src="https://js.stripe.com/v3/"></script>
      <script src="https://cdn.segment.com/analytics.js/v1/abc/analytics.min.js"></script>
      <script>posthog.init('key')</script>
      <div data-wf-site="123"></div>`;
    const out = detectFromHtmlAndHeaders(html, {
      "x-powered-by": "Next.js",
    });
    expect(out).toEqual(
      expect.arrayContaining(["Stripe", "Segment", "PostHog", "Webflow", "Next.js"]),
    );
  });

  it("returns empty array on clean homepage", () => {
    expect(detectFromHtmlAndHeaders("<html><body>Hello</body></html>", {})).toEqual([]);
  });

  it("handles case-insensitive headers", () => {
    expect(detectFromHtmlAndHeaders("", { Server: "cloudflare" })).toContain("Cloudflare");
  });

  it("sorts output alphabetically for stable diffs", () => {
    const out = detectFromHtmlAndHeaders(
      `<script src="https://js.stripe.com"></script><script src="//cdn.amplitude.com/x"></script>`,
      {},
    );
    expect(out).toEqual([...out].sort());
  });
});
