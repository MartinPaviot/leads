/**
 * Server-side Sentry bootstrap (Node.js runtime — API routes, server
 * actions, server components).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
  });
}
