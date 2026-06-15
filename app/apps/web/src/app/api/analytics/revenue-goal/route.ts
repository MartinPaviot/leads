import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import { parseMonthlyGoal } from "@/lib/analytics/revenue-goal";

/**
 * GET / POST /api/analytics/revenue-goal
 *
 * The monthly revenue target that GET /api/analytics/forecast reads to compute
 * goal coverage and name the bottleneck (The Method, steps 1/8). Stored in
 * tenants.settings.revenueGoal (jsonb, no migration). Tenant-scoped; the write
 * is gated to non-viewers like every other workspace-config mutation. The
 * input validation lives in lib/analytics/revenue-goal.ts (pure, unit-tested).
 */

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getTenantSettings(authCtx.tenantId);
  const monthly = settings.revenueGoal?.monthly ?? settings.revenueGoal?.amount ?? null;
  return Response.json({ monthly, updatedAt: settings.revenueGoal?.updatedAt ?? null });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (authCtx.role === "viewer") {
    return Response.json({ error: "Viewers can't change the revenue goal." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = parseMonthlyGoal((body as { monthly?: unknown }).monthly);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  await updateTenantSettings(authCtx.tenantId, {
    revenueGoal: { monthly: parsed.monthly ?? undefined, updatedAt: new Date().toISOString() },
  });
  return Response.json({ monthly: parsed.monthly });
}
