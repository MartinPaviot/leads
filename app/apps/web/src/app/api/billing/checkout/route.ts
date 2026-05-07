import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { users } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { stripe } from "@/lib/billing/stripe";
import { and, eq } from "drizzle-orm";

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

export async function POST(request: Request) {
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

    // Find or create Stripe customer — tolerate missing subscriptions table
    let stripeCustomerId: string;
    let existingSub: Record<string, unknown> | undefined;
    try {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);
      existingSub = rows[0] as Record<string, unknown> | undefined;
    } catch (e) {
      if (isTableMissing(e)) {
        existingSub = undefined;
      } else {
        throw e;
      }
    }

    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId as string;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { tenantId },
      });
      stripeCustomerId = customer.id;

      // Create a subscription record to store the customer ID — skip if table missing
      try {
        await db.insert(subscriptions).values({
          tenantId,
          stripeCustomerId,
          status: "trialing",
        });
      } catch (e) {
        if (!isTableMissing(e)) throw e;
        console.warn("subscriptions table missing — skipping record insert");
      }
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
