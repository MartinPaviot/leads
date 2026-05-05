import { stripe } from "@/lib/billing/stripe";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

/**
 * Extract the subscription ID from an invoice's parent details.
 * In Stripe API >= dahlia, `invoice.subscription` was moved to
 * `invoice.parent.subscription_details.subscription`.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subRef = invoice.parent?.subscription_details?.subscription;
  if (!subRef) return null;
  return typeof subRef === "string" ? subRef : subRef.id;
}

/**
 * Compute the current billing period from a Subscription object.
 * Since `current_period_start` / `current_period_end` were removed in the
 * dahlia API version, we derive the period from `billing_cycle_anchor` and
 * the first item's price interval. Falls back to anchor -> +30d.
 */
function computePeriod(sub: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const anchorSec = sub.billing_cycle_anchor;
  const anchor = new Date(anchorSec * 1000);
  const now = new Date();

  // Get interval from first item
  const interval = sub.items.data[0]?.price?.recurring?.interval ?? "month";
  const intervalCount =
    sub.items.data[0]?.price?.recurring?.interval_count ?? 1;

  // Walk forward from anchor to find the period that contains "now"
  let periodStart = new Date(anchor);
  let periodEnd = advanceDate(periodStart, interval, intervalCount);

  while (periodEnd <= now) {
    periodStart = new Date(periodEnd);
    periodEnd = advanceDate(periodStart, interval, intervalCount);
  }

  return { start: periodStart, end: periodEnd };
}

function advanceDate(
  date: Date,
  interval: string,
  count: number
): Date {
  const d = new Date(date);
  switch (interval) {
    case "day":
      d.setDate(d.getDate() + count);
      break;
    case "week":
      d.setDate(d.getDate() + 7 * count);
      break;
    case "month":
      d.setMonth(d.getMonth() + count);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + count);
      break;
    default:
      d.setMonth(d.getMonth() + count);
  }
  return d;
}

export async function POST(request: Request) {
  if (!stripe) {
    return Response.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json(
      { error: "Stripe webhook secret is not configured" },
      { status: 503 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        if (!tenantId || !session.subscription) break;

        const stripeSub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const period = computePeriod(stripeSub);

        const subValues = {
          stripeSubscriptionId: stripeSub.id,
          stripeCustomerId: stripeSub.customer as string,
          stripePriceId: stripeSub.items.data[0]?.price.id ?? null,
          status: stripeSub.status as any,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          trialStart: stripeSub.trial_start
            ? new Date(stripeSub.trial_start * 1000)
            : null,
          trialEnd: stripeSub.trial_end
            ? new Date(stripeSub.trial_end * 1000)
            : null,
          updatedAt: new Date(),
        };

        const [existing] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, tenantId))
          .limit(1);

        if (existing) {
          await db
            .update(subscriptions)
            .set(subValues)
            .where(eq(subscriptions.tenantId, tenantId));
        } else {
          await db.insert(subscriptions).values({
            tenantId,
            ...subValues,
          });
        }

        // Update tenant plan
        const plan = getPlanFromPriceId(
          stripeSub.items.data[0]?.price.id ?? null
        );
        await db
          .update(tenants)
          .set({ plan, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        break;
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const tenantId = stripeSub.metadata?.tenantId;
        if (!tenantId) break;

        const period = computePeriod(stripeSub);

        await db
          .update(subscriptions)
          .set({
            status: stripeSub.status as any,
            stripePriceId: stripeSub.items.data[0]?.price.id ?? null,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            trialStart: stripeSub.trial_start
              ? new Date(stripeSub.trial_start * 1000)
              : null,
            trialEnd: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000)
              : null,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.tenantId, tenantId));

        // Update tenant plan
        const plan = getPlanFromPriceId(
          stripeSub.items.data[0]?.price.id ?? null
        );
        await db
          .update(tenants)
          .set({ plan, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const tenantId = stripeSub.metadata?.tenantId;
        if (!tenantId) break;

        await db
          .update(subscriptions)
          .set({
            status: "canceled",
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.tenantId, tenantId));

        await db
          .update(tenants)
          .set({ plan: "canceled", updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubscriptionIdFromInvoice(invoice);
        if (!subId) break;

        await db
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, subId));

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubscriptionIdFromInvoice(invoice);
        if (!subId) break;

        await db
          .update(subscriptions)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, subId));

        break;
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return Response.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

function getPlanFromPriceId(priceId: string | null): string {
  if (!priceId) return "trial";
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return "starter";
}
