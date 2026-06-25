import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only — exposes plan + Stripe customer/price identifiers.
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const tenantId = authCtx.tenantId;

    // Get tenant plan
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    // Get subscription (table may not exist if billing schema not migrated)
    let sub = null;
    try {
      const [row] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .orderBy(sql`${subscriptions.createdAt} desc`)
        .limit(1);
      sub = row || null;
    } catch {
      // Billing table doesn't exist yet — that's OK
    }

    return Response.json({
      plan: tenant?.plan ?? "trial",
      status: sub?.status ?? null,
      stripePriceId: sub?.stripePriceId ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      trialEnd: sub?.trialEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    });
  } catch (error) {
    console.error("Failed to fetch subscription:", error);
    return Response.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
