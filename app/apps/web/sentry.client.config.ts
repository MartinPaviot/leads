/**
 * Client-side Sentry bootstrap (browser).
 *
 * Conditional on `NEXT_PUBLIC_SENTRY_DSN` — unset = no-op. Keep this
 * file small; do not import any app code here, or you'll bloat the
 * landing-page bundle even when Sentry is disabled.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of sessions for replay; 100% when there's an error.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    // Release tagging can be added in CI via `sentry-cli releases`. Not
    // wired here to avoid failing `next build` when sentry-cli is absent.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
