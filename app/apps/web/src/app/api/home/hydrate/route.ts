import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { GET as getOnboardingStatus } from "@/app/api/onboarding/status/route";
import { GET as getDashboardSummary } from "@/app/api/dashboard/summary/route";
import { GET as getActions } from "@/app/api/actions/route";
import { GET as getInsights } from "@/app/api/insights/route";
import { GET as getPriorities } from "@/app/api/priorities/route";
import { GET as getRecommendations } from "@/app/api/recommendations/route";
import { getAuthContext } from "@/lib/auth-utils";
import { markTtfaaCompletedV1Proxy } from "@/lib/ttfaa";

/**
 * `/api/home/hydrate` — T1 P2 H1. Server-side fan-out of the six
 * separate home-page fetches (onboarding status, dashboard summary,
 * actions, insights, priorities, recommendations) into one round-trip.
 *
 * Runs them in parallel and returns a single payload keyed by section.
 * Each section independently null-ifies on failure so one slow or
 * broken handler can't brick the whole page — the client keeps the
 * pre-existing "try each section, fall back on failure" semantics.
 *
 * Why not an RSC streaming render? The home page is heavily client-
 * driven (EmailComposer, onboarding modal state, localStorage welcome
 * gate). A single hydrate endpoint preserves that architecture while
 * cutting 6 round-trips → 1.
 */

// The six home-page route handlers have slightly different arities —
// some take `req`, some take none. Union them loosely and call through
// a narrow dispatch helper that always supplies `req`.
type AnyGet =
  | (() => Promise<Response>)
  | ((req: Request) => Promise<Response>);

export async function GET(req: Request) {
  const [
    onboarding,
    summary,
    actions,
    insights,
    priorities,
    recommendations,
  ] = await Promise.all([
    callSection(getOnboardingStatus as AnyGet, "onboarding-status", req),
    callSection(getDashboardSummary as AnyGet, "dashboard-summary", req),
    callSection(getActions as AnyGet, "actions", req),
    callSection(getInsights as AnyGet, "insights", req),
    callSection(getPriorities as AnyGet, "priorities", req),
    callSection(getRecommendations as AnyGet, "recommendations", req),
  ]);

  // WS-0 — Time-To-First-Agent-Action v1 proxy completion signal.
  // Fires the FIRST time a post-onboarding tenant's hydrate returns a
  // summary with >=1 enriched record. The helper is idempotent via
  // `settings.ttfaaCompletedAtV1Proxy`, so this block can safely run on
  // every hydrate without re-firing.
  //
  // Fire-and-forget — hydrate must never wait on telemetry. We attach
  // `.catch` to the promise below so any rejection is swallowed by the
  // helper's own logger.warn (see lib/ttfaa.ts).
  const onboardingPayload = onboarding as
    | { needsOnboarding?: boolean; userId?: string }
    | null;
  const summaryPayload = summary as
    | { founderMetrics?: { totalAccounts?: number } }
    | null;
  const enrichedRecordCount = summaryPayload?.founderMetrics?.totalAccounts ?? 0;
  if (
    onboardingPayload?.needsOnboarding === false &&
    enrichedRecordCount >= 1
  ) {
    const authCtx = await getAuthContext().catch(() => null);
    if (authCtx) {
      void markTtfaaCompletedV1Proxy({
        userId: authCtx.userId,
        tenantId: authCtx.tenantId,
        enrichedRecordCount,
      });
    }
  }

  return NextResponse.json({
    onboarding,
    summary,
    actions,
    insights,
    priorities,
    recommendations,
  });
}

/**
 * Invoke a route handler and parse its JSON body. Returns `null` on any
 * failure — we never throw out of the hydrate endpoint; the client
 * treats `null` as "unloaded" which is identical to the 6-fetch
 * world's failure mode.
 */
async function callSection(
  handler: AnyGet,
  name: string,
  req: Request
): Promise<unknown> {
  try {
    // `handler.length` is 0 for no-arg GETs; supply req to everything
    // else. Extra args on 0-arg functions are ignored at runtime but
    // typescript flags them, so we take the path-by-length route.
    const res =
      handler.length === 0
        ? await (handler as () => Promise<Response>)()
        : await (handler as (r: Request) => Promise<Response>)(req);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    logger.warn("home/hydrate: section fetch failed", { section: name, err });
    return null;
  }
}
