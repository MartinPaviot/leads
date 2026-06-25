/**
 * GET /api/dashboard/visitor-id-spend
 *
 * P0-2 follow-up — exposes the current tenant's visitor-ID spend
 * decision (spend / cap / warning / reached) so the dashboard can
 * render a banner when the tenant is approaching or has hit their
 * cap. The Inngest worker already logs warnings + emits metrics ;
 * this endpoint is the surface the founder-facing UI reads from.
 *
 * Admin-only (AI spend is an admin-scoped view) and tenant-scoped. The
 * pure decider (`loadSpendDecision`) is
 * shared with the worker so the banner state matches the worker's
 * gating decision exactly.
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  tenants,
  visits,
  visitorIdCharges,
} from "@/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  loadSpendDecision,
  startOfUtcMonth,
} from "@/lib/visitor-id/spend-cap";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only — AI spend figures (spend / cap / remaining) are a privileged
  // view; a member must not read the workspace's spend from the dashboard.
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const decision = await loadSpendDecision({
    tenantId: authCtx.tenantId,
    deps: {
      countIdentificationsThisMonth: async (tid, now) => {
        const since = startOfUtcMonth(now);
        const [{ c }] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(visits)
          .where(
            and(
              eq(visits.tenantId, tid),
              isNotNull(visits.identifiedAt),
              isNotNull(visits.companyDomain),
              gte(visits.identifiedAt, since),
            ),
          );
        return c;
      },
      loadTenantSettings: async (tid) => {
        const [t] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, tid))
          .limit(1);
        return (t?.settings as Record<string, unknown> | null) ?? null;
      },
      sumChargesThisMonth: async (tid, now) => {
        const since = startOfUtcMonth(now);
        const [row] = await db
          .select({
            totalUsd: sql<number>`COALESCE(SUM(${visitorIdCharges.costUsd}), 0)::float8`,
            rowCount: sql<number>`count(*)::int`,
          })
          .from(visitorIdCharges)
          .where(
            and(
              eq(visitorIdCharges.tenantId, tid),
              gte(visitorIdCharges.chargedAt, since),
            ),
          );
        return {
          totalUsd: Number(row?.totalUsd ?? 0),
          rowCount: Number(row?.rowCount ?? 0),
        };
      },
    },
  });

  return Response.json({
    spendUsd: decision.spendUsd,
    capUsd: decision.capUsd,
    remainingUsd: decision.remainingUsd,
    reached: decision.reached,
    warning: decision.warning,
    asOf: new Date().toISOString(),
  });
}
