import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantId = authCtx.tenantId;

    // Get tenant plan
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    // Get subscription
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(sql`${subscriptions.createdAt} desc`)
      .limit(1);

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
