import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import {
  migrateAllTenants,
  migrateTenant,
} from "@/lib/migrations/ws-1-guardrail-defaults";
import logger from "@/lib/observability/logger";

/**
 * WS-1 migration admin endpoint.
 *
 * Gated via `getAuthContext + requireAdmin` (same pattern as
 * `api/admin/purge-fake-data/route.ts`). Intended to be called twice:
 *  1. `dryRun: true`  → inspect the would-be mutations.
 *  2. `dryRun: false` → apply them.
 *
 * Body shape:
 *   { dryRun?: boolean, tenantId?: string }
 *
 * Without `tenantId`, migrates every tenant in batches. With a
 * specific `tenantId`, migrates only that one (useful for re-running
 * a failed single tenant or for smoke-testing on a seed tenant
 * before fleet-wide execution).
 *
 * Idempotent — a tenant already migrated returns `{ status: "skipped" }`.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean;
    tenantId?: string;
    batchSize?: number;
  };

  // Default to dry-run. Explicit `dryRun: false` required to execute.
  const dryRun = body.dryRun !== false;

  try {
    if (body.tenantId) {
      const result = await migrateTenant(body.tenantId, { dryRun });
      return NextResponse.json({
        singleTenant: true,
        dryRun,
        result,
      });
    }

    const report = await migrateAllTenants({
      dryRun,
      batchSize: body.batchSize,
    });
    return NextResponse.json(report);
  } catch (err) {
    logger.error("ws-1 migration endpoint failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Migration failed" },
      { status: 500 },
    );
  }
}
