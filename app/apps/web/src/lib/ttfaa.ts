/**
 * TTFAA — Time-To-First-Agent-Action telemetry.
 *
 * Implements the formal definition from the master onboarding refactor brief
 * §2.1.1: wall-clock duration from successful OAuth completion to the first
 * moment a user-visible agent action appears on screen.
 *
 * For v1 of the onboarding (pre-refactor), we capture a PROXY completion
 * signal: the first time `/api/home/hydrate` returns a summary with >=1
 * enriched record after `onboardingCompleted === true`. This proxies the
 * brief's canonical v2 stop points (confirmation card populated, warm lead
 * draft visible, TAM reveal >=1 company) which don't exist yet in v1.
 *
 * Both emission points are idempotent per tenant. The idempotency guards
 * live in `tenants.settings` JSONB (`ttfaaSessionId`, `ttfaaCompletedAtV1Proxy`)
 * so a logout/login or a token refresh cannot double-fire.
 *
 * Design decisions recorded in docs/specs/WS-0-spec.md §6 ADRs.
 */

import { captureEvent } from "@/lib/analytics";
import { getTenantSettings, updateTenantSettings } from "@/lib/tenant-settings";
import logger from "@/lib/logger";

type OAuthProvider = "google" | "microsoft-entra-id";

export interface TtfaaStartResult {
  sessionCorrelationId: string;
  alreadyStarted: boolean;
}

export interface TtfaaCompleteResult {
  durationMs: number | null;
  alreadyCompleted: boolean;
  sessionCorrelationId: string | null;
}

/**
 * Emit `ttfaa_started` for a tenant on their first successful OAuth callback.
 * Idempotent — a second call returns `{ alreadyStarted: true }` without
 * firing a duplicate event or touching the DB.
 *
 * Called from `auth.ts` jwt callback under the same guard that emits the
 * existing `google/oauth-connected` and `microsoft/oauth-connected` Inngest
 * events. Mirror of the pattern at `auth.ts:325-352`.
 *
 * Errors are logged and swallowed — telemetry must never break auth.
 */
export async function markTtfaaStarted(params: {
  userId: string;
  tenantId: string;
  provider: OAuthProvider;
}): Promise<TtfaaStartResult> {
  const { userId, tenantId, provider } = params;

  try {
    const settings = await getTenantSettings(tenantId);
    if (settings.ttfaaSessionId && settings.ttfaaStartedAt) {
      return {
        sessionCorrelationId: settings.ttfaaSessionId,
        alreadyStarted: true,
      };
    }

    const sessionCorrelationId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    await updateTenantSettings(tenantId, {
      ttfaaSessionId: sessionCorrelationId,
      ttfaaStartedAt: startedAt,
    });

    // Fire the event AFTER the DB write so we never emit a "started" event
    // whose correlation ID can't be looked up by the completion handler.
    await captureEvent(userId, "ttfaa_started", {
      provider,
      sessionCorrelationId,
    });

    return { sessionCorrelationId, alreadyStarted: false };
  } catch (err) {
    logger.warn("ttfaa: markTtfaaStarted failed", { tenantId, err });
    // Swallow — auth must not break on telemetry.
    return {
      sessionCorrelationId: "",
      alreadyStarted: false,
    };
  }
}

/**
 * Emit `ttfaa_completed_v1_proxy` the first time a hydrated dashboard
 * summary shows >=1 enriched record for a completed-onboarding tenant.
 * Idempotent via `settings.ttfaaCompletedAtV1Proxy`.
 *
 * Called from `/api/home/hydrate` after the parallel section fetches
 * resolve. Fire-and-forget semantics — hydrate must never wait on this.
 *
 * If `ttfaaStartedAt` is missing (legacy tenants whose OAuth predates this
 * instrumentation), durationMs is null and the event still fires so the
 * funnel has some signal — PostHog-side filters can exclude null-duration
 * rows.
 */
export async function markTtfaaCompletedV1Proxy(params: {
  userId: string;
  tenantId: string;
  enrichedRecordCount: number;
}): Promise<TtfaaCompleteResult> {
  const { userId, tenantId, enrichedRecordCount } = params;

  try {
    const settings = await getTenantSettings(tenantId);
    if (settings.ttfaaCompletedAtV1Proxy) {
      return {
        durationMs: null,
        alreadyCompleted: true,
        sessionCorrelationId: settings.ttfaaSessionId ?? null,
      };
    }

    const completedAt = new Date();
    let durationMs: number | null = null;
    if (settings.ttfaaStartedAt) {
      const started = new Date(settings.ttfaaStartedAt).getTime();
      const completed = completedAt.getTime();
      if (Number.isFinite(started) && completed >= started) {
        durationMs = completed - started;
      }
    }

    const sessionCorrelationId = settings.ttfaaSessionId ?? "";

    await updateTenantSettings(tenantId, {
      ttfaaCompletedAtV1Proxy: completedAt.toISOString(),
    });

    await captureEvent(userId, "ttfaa_completed_v1_proxy", {
      durationMs: durationMs ?? 0,
      enrichedRecordCount,
      sessionCorrelationId,
    });

    return {
      durationMs,
      alreadyCompleted: false,
      sessionCorrelationId: sessionCorrelationId || null,
    };
  } catch (err) {
    logger.warn("ttfaa: markTtfaaCompletedV1Proxy failed", { tenantId, err });
    return {
      durationMs: null,
      alreadyCompleted: false,
      sessionCorrelationId: null,
    };
  }
}
