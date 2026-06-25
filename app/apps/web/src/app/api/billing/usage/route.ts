import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { subscriptions, usageEvents } from "@/db/billing-schema";
import { eq, and, gte, sql } from "drizzle-orm";

/** Default empty usage response when billing tables are unavailable */
function emptyUsage() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return Response.json({
    periodStart: periodStart.toISOString(),
    periodEnd: null,
    usage: {
      api_call: 0,
      email_sent: 0,
      contact_enriched: 0,
      ai_query: 0,
    },
  });
}

/** Check if an error indicates a missing table / relation */
function isTableMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("undefined table") ||
    msg.includes("no such table")
  );
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only — workspace billing/usage meters are a privileged view.
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const tenantId = authCtx.tenantId;

    // Get current billing period start — tolerate missing subscriptions table
    let sub: Record<string, unknown> | undefined;
    try {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);
      sub = rows[0] as Record<string, unknown> | undefined;
    } catch {
      // subscriptions table not migrated yet — continue with defaults
      sub = undefined;
    }

    const periodStart =
      (sub?.currentPeriodStart as Date | undefined) ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Aggregate usage by event type — tolerate missing usage_events table
    let usageMap: Record<string, number> = {};
    try {
      const usage = await db
        .select({
          eventType: usageEvents.eventType,
          total: sql<number>`coalesce(sum(${usageEvents.count}), 0)`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.tenantId, tenantId),
            gte(usageEvents.createdAt, periodStart)
          )
        )
        .groupBy(usageEvents.eventType);

      for (const row of usage) {
        usageMap[row.eventType] = Number(row.total);
      }
    } catch {
      // usage_events table not migrated yet — return zeros
      usageMap = {};
    }

    return Response.json({
      periodStart: periodStart.toISOString(),
      periodEnd:
        (sub?.currentPeriodEnd as Date | undefined)?.toISOString() ?? null,
      usage: {
        api_call: usageMap.api_call ?? 0,
        email_sent: usageMap.email_sent ?? 0,
        contact_enriched: usageMap.contact_enriched ?? 0,
        ai_query: usageMap.ai_query ?? 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch usage:", error);
    return emptyUsage();
  }
}
