import { db } from "@/db";
import { tenants } from "@/db/schema";
import { verifyCronRequest } from "@/lib/auth/cron-auth";
import { evaluateTenantDeals, type BatchResult } from "@/lib/deal-progression/engine";

/**
 * AI Deal Stage Auto-Progression (v2 — engine-backed)
 *
 * Evaluates active deals across all tenants using the autonomous deal
 * progression engine. The engine detects activity-based signals, applies
 * configurable progression rules, and routes changes through the
 * approval-mode guardrail system.
 *
 * Run as cron every 12-24h or on-demand.
 *
 * Previous implementation used a single LLM call per deal to decide
 * progression. This version replaces the LLM with deterministic signal
 * detection (cheaper, faster, auditable) and defers to the approval-mode
 * system for trust calibration.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    const results: BatchResult[] = [];

    for (const tenant of allTenants) {
      const tenantResult = await evaluateTenantDeals(tenant.id);
      results.push(tenantResult);
    }

    const totalEvaluated = results.reduce((s, r) => s + r.evaluated, 0);
    const totalProgressed = results.reduce((s, r) => s + r.progressed, 0);
    const totalSuggested = results.reduce((s, r) => s + r.suggested, 0);
    const totalFlagged = results.reduce((s, r) => s + r.flagged, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);

    return Response.json({
      success: true,
      tenants: results.length,
      evaluated: totalEvaluated,
      progressed: totalProgressed,
      suggested: totalSuggested,
      flagged: totalFlagged,
      errors: totalErrors,
    });
  } catch (error) {
    console.error("Deal progression cron failed:", error);
    return Response.json({ error: "Deal progression failed" }, { status: 500 });
  }
}
