import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { getRecentActions } from "@/lib/agent-actions";

/**
 * GET /api/agent-actions — recent agent actions for the current
 * tenant. Used by the Settings → Agent action history page (UI
 * deferred; endpoint stable so the page can ship as a small
 * follow-up).
 *
 * Response: { actions: [...] }
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );

  const actions = await getRecentActions(authCtx.tenantId, limit);
  return NextResponse.json({ actions });
}
