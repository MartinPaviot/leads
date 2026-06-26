import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings, updateTenantSettings, DEFAULTS } from "@/lib/config/tenant-settings";

/**
 * Autopilot operational controls (Elevay's daily-autopilot kill-switch + budget).
 *
 *   GET → { paused, dailyAutopilotBudget }
 *   PUT → set { paused?, dailyAutopilotBudget? }
 *
 * Admin-only — affects the whole workspace. The cron (inngest/daily-autopilot.ts)
 * reads `autopilotPaused` via getConfig and skips a paused tenant (skip="paused"),
 * independent of the global DAILY_AUTOPILOT_ENABLED flag. This is the operator
 * kill-switch that makes turning the autopilot on reversible without an env change.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (authCtx.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

  const s = await getTenantSettings(authCtx.tenantId);
  return Response.json({
    paused: s.autopilotPaused ?? DEFAULTS.autopilotPaused,
    dailyAutopilotBudget: s.dailyAutopilotBudget ?? DEFAULTS.dailyAutopilotBudget,
  });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Admin-only — pausing/resuming the autopilot affects everyone in the workspace.
  if (authCtx.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    paused?: unknown;
    dailyAutopilotBudget?: unknown;
  };
  const updates: { autopilotPaused?: boolean; dailyAutopilotBudget?: number } = {};

  if ("paused" in body) {
    if (typeof body.paused !== "boolean") {
      return Response.json({ error: "paused must be a boolean" }, { status: 400 });
    }
    updates.autopilotPaused = body.paused;
  }

  if ("dailyAutopilotBudget" in body) {
    const b = body.dailyAutopilotBudget;
    if (typeof b !== "number" || !Number.isFinite(b) || b < 0 || b > 100_000) {
      return Response.json(
        { error: "dailyAutopilotBudget must be a number between 0 and 100000" },
        { status: 400 },
      );
    }
    updates.dailyAutopilotBudget = Math.floor(b);
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "nothing to update (expected `paused` and/or `dailyAutopilotBudget`)" },
      { status: 400 },
    );
  }

  await updateTenantSettings(authCtx.tenantId, updates);
  const s = await getTenantSettings(authCtx.tenantId);
  return Response.json({
    ok: true,
    paused: s.autopilotPaused ?? DEFAULTS.autopilotPaused,
    dailyAutopilotBudget: s.dailyAutopilotBudget ?? DEFAULTS.dailyAutopilotBudget,
  });
}
