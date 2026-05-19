/**
 * Next.js instrumentation hook — runs once on server startup.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Now also loads the runtime-appropriate Sentry config (T1-F13) so
 * server / edge exceptions land in Sentry. Missing DSN → no-op.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("../sentry.server.config");
    } catch (err) {
      console.warn("Sentry server init skipped:", err instanceof Error ? err.message : err);
    }

    try {
      const { ensureVectorIndex } = await import("@/db/ensure-vector-index");
      await ensureVectorIndex();
    } catch (err) {
      console.warn("Vector index setup skipped:", err instanceof Error ? err.message : err);
    }

    try {
      const { ensureCustomRecordsTable } = await import("@/db/ensure-custom-records");
      await ensureCustomRecordsTable();
    } catch (err) {
      console.warn("Custom records table setup skipped:", err instanceof Error ? err.message : err);
    }

    try {
      // MONACO-PARITY-01 + 05 — coaching transcript chunks + URL cache.
      const { ensureCoachingTables } = await import("@/db/ensure-coaching-tables");
      await ensureCoachingTables();
    } catch (err) {
      console.warn("Coaching tables setup skipped:", err instanceof Error ? err.message : err);
    }

    try {
      // voice-cold-call Phase 1 — calls, voicemail templates, DNC, pool, usage.
      const { ensureVoiceTables } = await import("@/db/ensure-voice-tables");
      await ensureVoiceTables();
    } catch (err) {
      console.warn("Voice tables setup skipped:", err instanceof Error ? err.message : err);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    try {
      await import("../sentry.edge.config");
    } catch (err) {
      console.warn("Sentry edge init skipped:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Surface server render / route handler errors to Sentry. Next.js
 * calls `onRequestError` from its error overlay + server-component
 * error boundary. Always-on — the Sentry `captureRequestError` helper
 * short-circuits when the DSN is unset.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const mod = await import("@sentry/nextjs");
    const captureRequestError = (mod as unknown as {
      captureRequestError?: (
        err: unknown,
        request: unknown,
        context: unknown
      ) => void;
    }).captureRequestError;
    if (typeof captureRequestError === "function") {
      captureRequestError(err, request, context);
    } else {
      mod.captureException(err);
    }
  } catch {
    // Swallow — never let Sentry forwarding break request handling.
  }
}
