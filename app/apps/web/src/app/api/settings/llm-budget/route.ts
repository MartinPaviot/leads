import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  getLlmBudgetStatus,
  invalidateBudgetCache,
} from "@/lib/billing/llm-budget";
import { getTenantCost } from "@/lib/billing/cost-tracker";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";

/**
 * GET → return current budget status + a feature-level spend breakdown.
 * PUT → set `llmMonthlyCostCapUsd`. Null / 0 / undefined disables the
 *       cap. Persists via updateTenantSettings + invalidates the
 *       30s budget status cache so the change takes effect on the
 *       next LLM call, not 30s from now.
 */

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only — workspace AI spend + budget is a privileged view. The PUT
  // below is already admin-gated; the read MUST match, otherwise a member
  // (end user) could pull the whole spend breakdown by calling this endpoint
  // directly. The settings sidebar only HIDES the nav item — that is not an
  // access control, and GET requests are never gated by the middleware.
  if (authCtx.role !== "admin") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  const [status, byFeatureTotals] = await Promise.all([
    getLlmBudgetStatus(authCtx.tenantId),
    getTenantCost(authCtx.tenantId, startOfMonthUtc()),
  ]);

  return Response.json({
    status,
    breakdown: {
      totalCost: byFeatureTotals.totalCost,
      totalTokens: byFeatureTotals.totalTokens,
      byFeature: byFeatureTotals.byFeature,
    },
    monthStart: startOfMonthUtc().toISOString(),
  });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only — cap changes affect everyone in the workspace.
  if (authCtx.role !== "admin") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = (body as { capUsd?: unknown }).capUsd;

  let capUsd: number | undefined;
  if (raw === null || raw === undefined || raw === "" || raw === 0 || raw === "0") {
    capUsd = undefined;
  } else if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    capUsd = raw;
  } else if (typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim())) {
    const parsed = Number(raw);
    capUsd = parsed > 0 ? parsed : undefined;
  } else {
    return Response.json(
      { error: "capUsd must be a non-negative number or null" },
      { status: 400 },
    );
  }

  // Hard safety rail: reject caps above $100k/mo. Not a security
  // boundary — just a "did you mean to type $100000?" check so a
  // typo doesn't silently open the floodgates.
  if (capUsd !== undefined && capUsd > 100_000) {
    return Response.json(
      { error: "capUsd seems unreasonable (>$100,000). Contact support to raise this rail." },
      { status: 400 },
    );
  }

  const settings = await getTenantSettings(authCtx.tenantId);
  await updateTenantSettings(authCtx.tenantId, {
    ...settings,
    llmMonthlyCostCapUsd: capUsd,
  });
  invalidateBudgetCache(authCtx.tenantId);

  const fresh = await getLlmBudgetStatus(authCtx.tenantId);
  return Response.json({ ok: true, status: fresh });
}
