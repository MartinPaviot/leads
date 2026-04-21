import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import {
  getOnboardingAgentLatency,
  type OnboardingAgentLatency,
} from "@/lib/observability-queries";

/**
 * Admin-only snapshot of the onboarding instrumentation baseline.
 *
 * PostHog is the primary surface for the funnel (see
 * docs/specs/WS-0-posthog-dashboard.md). This endpoint exists so
 * Martin can sanity-check the `agent_traces` side of the picture
 * (LLM latency + cost + error rates for `icp-analysis`, `build-tam`,
 * `onboarding-narrator`) without needing a PostHog API token, and
 * cross-reference numbers against the PostHog dashboard.
 *
 * Gating follows the pattern from
 * `api/admin/purge-fake-data/route.ts` and
 * `api/settings/llm-budget/route.ts`: `getAuthContext` → session
 * lookup, `requireAdmin` → 403 on non-admin.
 *
 * Query params:
 *  - since: ISO date (e.g. "2026-04-18"). Required.
 *  - until: ISO date. Optional, defaults to now.
 *  - tenantId: limit results to one tenant. Optional — admins can
 *    query globally by omitting.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");
  const tenantIdParam = url.searchParams.get("tenantId");

  if (!sinceRaw) {
    return NextResponse.json(
      { error: "since query param required (ISO date)" },
      { status: 400 }
    );
  }

  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: `since is not a valid ISO date: ${sinceRaw}` },
      { status: 400 }
    );
  }

  let until: Date | undefined;
  if (untilRaw) {
    const parsed = new Date(untilRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: `until is not a valid ISO date: ${untilRaw}` },
        { status: 400 }
      );
    }
    until = parsed;
  }

  let agentLatency: OnboardingAgentLatency[] = [];
  try {
    agentLatency = await getOnboardingAgentLatency({
      since,
      until,
      tenantId: tenantIdParam || undefined,
    });
  } catch (err) {
    console.error("admin/onboarding-metrics: query failed", err);
    return NextResponse.json(
      { error: "Metrics query failed — check server logs" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    window: {
      since: since.toISOString(),
      until: (until ?? new Date()).toISOString(),
    },
    tenantScope: tenantIdParam || "global",
    agentLatency,
    postHogFunnelProxyNote:
      "Funnel, drop-off, and per-step durations live in PostHog — this endpoint only covers the agent_traces (LLM) side. See docs/specs/WS-0-posthog-dashboard.md for the PostHog dashboard config.",
  });
}
