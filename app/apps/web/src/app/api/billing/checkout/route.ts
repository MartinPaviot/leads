import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { users } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { stripe } from "@/lib/stripe";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { priceId } = await request.json();
    if (!priceId) {
      return Response.json({ error: "priceId is required" }, { status: 400 });
    }

    const tenantId = authCtx.tenantId;

    // Get user record for email
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, authCtx.userId), eq(users.tenantId, tenantId)));
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Find or create Stripe customer
    let stripeCustomerId: string;
    const [existingSub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { tenantId },
      });
      stripeCustomerId = customer.id;

      // Create a subscription record to store the customer ID
      await db.insert(subscriptions).values({
        tenantId,
        stripeCustomerId,
        status: "trialing",
      });
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenantId },
      },
      metadata: { tenantId },
    });

    return Response.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    return Response.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
