import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { subscriptions } from "@/db/billing-schema";
import { stripe } from "@/lib/billing/stripe";
import { eq } from "drizzle-orm";

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

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guard: Stripe must be configured
  if (!stripe) {
    return Response.json(
      { error: "Billing is not configured. Stripe API key is missing." },
      { status: 503 }
    );
  }

  try {
    // Get subscription with Stripe customer ID — tolerate missing table
    let sub: Record<string, unknown> | undefined;
    try {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, authCtx.tenantId))
        .limit(1);
      sub = rows[0] as Record<string, unknown> | undefined;
    } catch (e) {
      if (isTableMissing(e)) {
        return Response.json(
          { error: "No billing account found. Billing tables have not been set up." },
          { status: 404 }
        );
      }
      throw e;
    }

    if (!sub?.stripeCustomerId) {
      return Response.json(
        { error: "No billing account found" },
        { status: 404 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId as string,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return Response.json({ url: portalSession.url });
  } catch (error) {
    console.error("Failed to create portal session:", error);
    return Response.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
