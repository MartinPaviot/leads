import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  getNudgeCandidate,
  recordNudgeResponse,
  type NudgeKind,
} from "@/lib/guardrails/trust-score";

/**
 * Progressive-autonomy nudge endpoint.
 *
 * GET  → `{ nudge: NudgeKind | null, currentMode, trustScore }`.
 *        The dashboard polls this on mount (and after any trust event)
 *        to decide whether to render a nudge banner. Returning `null`
 *        means "no nudge right now" — the banner stays hidden.
 *
 * POST → body `{ nudge: NudgeKind, response: "accepted" | "dismissed" }`.
 *        Persists the user's choice. Accepting mutates
 *        `agentApprovalMode` to the nudged value. Dismissing schedules
 *        re-surfacing in 14 days (handled on the next GET).
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nudge = await getNudgeCandidate(authCtx.tenantId);

  // Surface the tenant's current mode + score so the UI can render
  // a contextual explanation ("You've approved 30 drafts — ready to
  // relax to batch review?"). Settings are already cached for 5s.
  const { getTenantSettings } = await import("@/lib/config/tenant-settings");
  const settings = await getTenantSettings(authCtx.tenantId);

  return NextResponse.json({
    nudge,
    currentMode: settings.agentApprovalMode ?? null,
    trustScore: settings.trustScore ?? 0,
    agentMemoryPanelDiscovered:
      settings.agentMemoryPanelDiscovered ?? false,
  });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    nudge?: string;
    response?: string;
  };

  const validNudges: NudgeKind[] = ["batch-daily", "auto-high-confidence"];
  const validResponses = ["accepted", "dismissed"] as const;

  if (!validNudges.includes(body.nudge as NudgeKind)) {
    return NextResponse.json(
      { error: `nudge must be one of ${validNudges.join(" | ")}` },
      { status: 400 },
    );
  }
  if (!validResponses.includes(body.response as "accepted" | "dismissed")) {
    return NextResponse.json(
      { error: `response must be one of ${validResponses.join(" | ")}` },
      { status: 400 },
    );
  }

  await recordNudgeResponse({
    tenantId: authCtx.tenantId,
    userId: authCtx.userId,
    nudge: body.nudge as NudgeKind,
    response: body.response as "accepted" | "dismissed",
  });

  return NextResponse.json({ ok: true });
}
