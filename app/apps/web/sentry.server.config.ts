/**
 * Server-side Sentry bootstrap (Node.js runtime — API routes, server
 * actions, server components).
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    // H8 — never let Sentry auto-attach user email / IP / cookies;
    // `beforeSend` runs last and strips anything that leaked into
    // exception messages or breadcrumbs.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
