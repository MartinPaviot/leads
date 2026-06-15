/**
 * POST /api/billing/founder-led-checkout
 *
 * MONACO-PARITY-03 — premium upsell : "Founder-led onboarding session
 * with Martin" — one-time $299 (configurable via env).
 *
 * Decision Monaco-style : Monaco bundles the Forward-Deployed AE in
 * every contract; Elevay defaults to self-serve and offers Martin
 * as an upgrade. Pricing : $299 = ~25min of Martin's time at a
 * recoverable margin given a $999/mo subscription that follows.
 *
 * Stripe mode : `payment` (one-time, no subscription). Returns a
 * checkout URL the caller redirects to.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { users } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { stripe } from "@/lib/billing/stripe";
import { and, eq } from "drizzle-orm";
import { posthogEvents } from "@/lib/analytics/analytics";
import { logger } from "@/lib/observability/logger";

const DEFAULT_AMOUNT_CENTS = 29900; // $299
const DEFAULT_CURRENCY = "usd";

function isTableMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("undefined table") ||
    msg.includes("no such table")
  );
}

type ClickSource = "wizard_header" | "incomplete_banner" | "settings";
const CLICK_SOURCES: ClickSource[] = [
  "wizard_header",
  "incomplete_banner",
  "settings",
];

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Emit click telemetry early — we capture intent even if Stripe
  // is misconfigured. The user clicked, that's the funnel signal.
  let source: ClickSource = "wizard_header";
  try {
    const body = (await req.clone().json()) as { source?: string };
    if (body?.source && (CLICK_SOURCES as string[]).includes(body.source)) {
      source = body.source as ClickSource;
    }
  } catch {
    // No JSON body — keep default source.
  }
  posthogEvents
    .onboarding_v3_founder_led_clicked(authCtx.userId, {
      tenantId: authCtx.tenantId,
      source,
    })
    .catch((err: unknown) =>
      logger.warn("founder-led: posthog emit failed", { err }),
    );

  if (!stripe) {
    return Response.json(
      { error: "Billing is not configured." },
      { status: 503 },
    );
  }

  // Resolve pricing — env override lets us tune without redeploy.
  // FOUNDER_LED_PRICE_ID > FOUNDER_LED_AMOUNT_CENTS > default.
  const priceId = process.env.STRIPE_FOUNDER_LED_PRICE_ID;
  const amountCents = Number(
    process.env.FOUNDER_LED_AMOUNT_CENTS ?? DEFAULT_AMOUNT_CENTS,
  );
  const currency = process.env.FOUNDER_LED_CURRENCY ?? DEFAULT_CURRENCY;

  try {
    const tenantId = authCtx.tenantId;

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, authCtx.userId), eq(users.tenantId, tenantId)));
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Reuse existing Stripe customer if any (parallel to /checkout
    // route). One-time payments still need a customer record so the
    // payment shows up in the customer's invoice history.
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
      if (!isTableMissing(e)) throw e;
    }

    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId as string;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { tenantId, kind: "founder-led" },
      });
      stripeCustomerId = customer.id;
    }

    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: "Founder-led onboarding (30 min with Martin)",
              description:
                "Live kickoff call with the Elevay founder: ICP refinement, signal configuration, sequence voice-match, deal review. One-time premium upsell.",
            },
          },
        };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [lineItem as never],
      // The onboarding-v3 entry page was removed in the onboarding cleanup;
      // land back on the home briefing. This billing route is currently
      // orphaned (its only callers lived in the removed 7-phase flow) but is
      // kept as a re-wireable revenue path — see onboarding cleanup notes.
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?founder_led=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?founder_led=canceled`,
      metadata: { tenantId, kind: "founder-led" },
      payment_intent_data: {
        metadata: { tenantId, kind: "founder-led" },
      },
    });

    return Response.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Failed to create founder-led checkout:", error);
    return Response.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
