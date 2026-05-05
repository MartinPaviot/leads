import Stripe from "stripe";

/**
 * Stripe client — only available when STRIPE_SECRET_KEY is set.
 * Callers must check for null before using.
 */
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  : null;
