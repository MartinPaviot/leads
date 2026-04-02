import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { subscriptions } from "@/db/billing-schema";
import { stripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get subscription with Stripe customer ID
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, authCtx.tenantId))
      .limit(1);

    if (!sub?.stripeCustomerId) {
      return Response.json(
        { error: "No billing account found" },
        { status: 404 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
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
