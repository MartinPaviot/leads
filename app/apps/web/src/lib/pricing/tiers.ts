/**
 * Single source of truth for plan tiers.
 *
 * Read by:
 *   - app/(dashboard)/pricing/page.tsx        (marketing display)
 *   - app/(dashboard)/settings/billing/page.tsx (in-app usage panel)
 *   - lib/pricing/quota.ts                    (enforcement)
 *   - api/webhooks/stripe/route.ts (via getPlanFromPriceId)
 *
 * The goal is that changing a quota in this file is the ONLY thing needed
 * to keep marketing, settings, and enforcement aligned.
 */

export type PlanId = "trial" | "starter" | "pro" | "canceled";

export interface TierLimits {
  /** Total contact rows the tenant may own (resource-based, not reset). */
  contacts: number;
  /** `email_sent` usage events per billing period. */
  emailsPerMonth: number;
  /** `ai_query` usage events per billing period. `Infinity` means unlimited. */
  aiQueriesPerMonth: number;
}

export interface TierSpec {
  id: PlanId;
  /** Label shown to users. */
  displayName: string;
  /** e.g. "$49" or "$0". */
  price: string;
  /** e.g. "/month" or "14 days". */
  priceNote: string;
  description: string;
  /** CTA label on the pricing page. */
  cta: string;
  /**
   * Env var name that holds the Stripe price id for this tier, or null for
   * tiers that aren't purchasable (trial, canceled).
   */
  priceEnvKey: string | null;
  /**
   * Server-side env var holding the same Stripe price id (without the
   * `NEXT_PUBLIC_` prefix) for webhook plan resolution.
   */
  serverPriceEnvKey: string | null;
  highlighted: boolean;
  /** Bullet-list features shown on the pricing page. */
  features: string[];
  limits: TierLimits;
}

export const TIERS: Record<PlanId, TierSpec> = {
  trial: {
    id: "trial",
    displayName: "Free Trial",
    price: "$0",
    priceNote: "14 days",
    description: "Try Elevay with your real data. No credit card required.",
    cta: "Current Plan",
    priceEnvKey: null,
    serverPriceEnvKey: null,
    highlighted: false,
    features: [
      "100 contacts",
      "50 emails / month",
      "100 AI queries / month",
      "Automatic email capture",
      "Basic lead scoring",
      "1 connected mailbox",
      "Community support",
    ],
    limits: {
      contacts: 100,
      emailsPerMonth: 50,
      aiQueriesPerMonth: 100,
    },
  },
  starter: {
    id: "starter",
    displayName: "Starter",
    price: "$49",
    priceNote: "/month",
    description: "For founder-led sales teams closing their first deals.",
    cta: "Get Started",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID",
    serverPriceEnvKey: "STRIPE_STARTER_PRICE_ID",
    highlighted: true,
    features: [
      "1,000 contacts",
      "500 emails / month",
      "500 AI queries / month",
      "Automatic email capture",
      "ML-powered lead scoring",
      "3 connected mailboxes",
      "Outbound sequences",
      "Deal pipeline",
      "Email support",
    ],
    limits: {
      contacts: 1000,
      emailsPerMonth: 500,
      aiQueriesPerMonth: 500,
    },
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    price: "$99",
    priceNote: "/month",
    description: "Full autonomous GTM engine. Zero manual work.",
    cta: "Go Pro",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    serverPriceEnvKey: "STRIPE_PRO_PRICE_ID",
    highlighted: false,
    features: [
      "10,000 contacts",
      "5,000 emails / month",
      "Unlimited AI queries",
      "Automatic email capture",
      "ML-powered lead scoring",
      "Unlimited mailboxes",
      "Outbound sequences",
      "Deal pipeline + coaching",
      "Signal-based prioritization",
      "Auto-built TAM",
      "Priority support",
    ],
    limits: {
      contacts: 10_000,
      emailsPerMonth: 5_000,
      aiQueriesPerMonth: Number.POSITIVE_INFINITY,
    },
  },
  canceled: {
    id: "canceled",
    displayName: "Canceled",
    price: "—",
    priceNote: "",
    description:
      "Your subscription ended. Data is retained; restart to resume full access.",
    cta: "Restart",
    priceEnvKey: null,
    serverPriceEnvKey: null,
    highlighted: false,
    features: [],
    // Canceled mirrors trial limits, so a cancelled tenant cannot quietly
    // keep operating at pro capacity after their sub ends.
    limits: {
      contacts: 100,
      emailsPerMonth: 50,
      aiQueriesPerMonth: 100,
    },
  },
};

/** Tiers that should appear on the public pricing page, in display order. */
export const PUBLIC_TIER_IDS = ["trial", "starter", "pro"] as const satisfies readonly PlanId[];

/**
 * Resolve a plan name (string from the db or a Stripe webhook) to a TierSpec.
 * Unknown / null / undefined → trial (safest fallback: most restrictive).
 */
export function getTierForPlan(plan: string | null | undefined): TierSpec {
  if (!plan) return TIERS.trial;
  if ((plan as PlanId) in TIERS) return TIERS[plan as PlanId];
  return TIERS.trial;
}

/**
 * Per-tenant limit resolution.
 *
 * Merge rules (missing-or-null = inherit, number = override):
 *   - If overrides[key] is `undefined` or `null` → use tier default.
 *   - If overrides[key] is a finite number → use it, including `0` (hard block).
 *   - If overrides[key] is a non-number (garbage in jsonb) → ignore, use default.
 */
export function getLimitsForTenant(
  plan: string | null | undefined,
  overrides: Partial<Record<keyof TierLimits, number | null>> | null | undefined
): TierLimits {
  const base = getTierForPlan(plan).limits;
  if (!overrides || typeof overrides !== "object") return base;

  const merged: TierLimits = { ...base };
  for (const key of ["contacts", "emailsPerMonth", "aiQueriesPerMonth"] as const) {
    const o = overrides[key];
    if (o === undefined || o === null) continue;
    if (typeof o !== "number" || !Number.isFinite(o) || o < 0) continue;
    merged[key] = o;
  }
  return merged;
}

/**
 * Convert an in-memory limit to a JSON-safe value.
 * `Infinity` is not representable in JSON; we use `null` to mean "unlimited".
 */
export function serialiseLimit(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Look up the PlanId whose Stripe price id matches `priceId`.
 * Reads env vars lazily so tests can mutate process.env without re-importing.
 */
export function getPlanFromPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return "trial";
  for (const id of ["starter", "pro"] as const) {
    const envKey = TIERS[id].serverPriceEnvKey;
    if (envKey && process.env[envKey] === priceId) return id;
  }
  // An unknown paid priceId shouldn't silently become "trial" — that would
  // under-quota a legitimate paying customer. Default to "starter" so they
  // at least get paid-tier limits until we adjust TIERS.
  return "starter";
}
