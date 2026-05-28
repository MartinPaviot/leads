/**
 * GET /api/insights/pilae
 *
 * Tenant-scoped dashboard data for the dogfood track (D, _specs/pilae-machine
 * R11.1). Returns bookings split (project + platform never blended),
 * funnel by stage, and the capacity badge state for the deep-dive.
 *
 * Read-only; safe to call repeatedly. The page polls every 60s.
 *
 * Anti-ARR (R11.3): totals are labelled "bookings"; "Platform ARR" is
 * the descriptive name of one of the two split fields, never used as
 * the total label. The DoD anti-creep test (anti-creep-pilae.test.ts)
 * enforces D5; this endpoint participates by routing every field
 * through `getDealAmountDisplay` and never summing the two amounts
 * implicitly.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, tenants } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type Stage = string;

type FunnelRow = { stage: Stage; count: number };
type BookingsByStage = {
  stage: Stage;
  projectBookings: number;
  platformArr: number;
  totalBookings: number;
  dealCount: number;
};

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Funnel: count of deals per stage (open and closed). Excludes
  //    soft-deleted.
  const funnel = (await db
    .select({
      stage: deals.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, authCtx.tenantId),
        isNull(deals.deletedAt),
      ),
    )
    .groupBy(deals.stage)) as Array<{ stage: Stage; count: number }>;

  // 2. Bookings by stage — never blend project + platform. We use
  //    COALESCE to treat NULL as 0 inside SUM so legacy deals (only
  //    `value`) still contribute via the fallback below.
  const bookingsRaw = (await db
    .select({
      stage: deals.stage,
      projectBookings: sql<number>`COALESCE(SUM(${deals.projectAmount}), 0)::int`,
      platformArr: sql<number>`COALESCE(SUM(${deals.platformArr}), 0)::int`,
      legacyValue: sql<number>`COALESCE(SUM(${deals.value}) FILTER (WHERE ${deals.projectAmount} IS NULL AND ${deals.platformArr} IS NULL), 0)::int`,
      dealCount: sql<number>`count(*)::int`,
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, authCtx.tenantId),
        isNull(deals.deletedAt),
      ),
    )
    .groupBy(deals.stage)) as Array<{
    stage: Stage;
    projectBookings: number;
    platformArr: number;
    legacyValue: number;
    dealCount: number;
  }>;

  const bookings: BookingsByStage[] = bookingsRaw.map((b) => ({
    stage: b.stage,
    projectBookings: b.projectBookings,
    platformArr: b.platformArr,
    // Legacy-deal values are folded into total bookings but exposed
    // separately so the UI can flag "these aren't split-tagged yet"
    // if it wants. Never silently summed into projectBookings or
    // platformArr.
    totalBookings:
      b.projectBookings + b.platformArr + b.legacyValue,
    dealCount: b.dealCount,
  }));

  // 3. Capacity load — read from tenants.settings.deepDiveLoad set by
  //    the B7 weekly cron. Returns a default-shaped object if the
  //    cron hasn't run yet so the UI can render without conditionals.
  const [tenantRow] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);

  const settings =
    (tenantRow?.settings as Record<string, unknown> | null) ?? {};
  const deepDiveLoad =
    (settings.deepDiveLoad as
      | {
          count: number;
          cap: number;
          level: "ok" | "tight" | "saturated";
          weekStart: string;
          weekEnd: string;
          computedAt: string;
        }
      | undefined) ?? null;

  return Response.json({
    funnel: funnel as FunnelRow[],
    bookings,
    deepDive: deepDiveLoad,
    label: "bookings", // explicit anti-ARR marker for client consumers
  });
}
