"use client";

import { useState, useEffect } from "react";
import { Check, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tierState } from "@/lib/billing/pricing-tier";

interface Tier {
  name: string;
  price: string;
  priceNote: string;
  description: string;
  cta: string;
  priceEnvKey: string | null;
  highlighted: boolean;
  features: string[];
}

const tiers: Tier[] = [
  {
    name: "Free Trial",
    price: "$0",
    priceNote: "14 days",
    description: "Try Elevay with your real data. No credit card required.",
    cta: "Get started free",
    priceEnvKey: null,
    highlighted: false,
    features: [
      "100 contacts", "50 emails / month", "100 AI queries / month",
      "Automatic email capture", "Basic lead scoring", "1 connected mailbox", "Community support",
    ],
  },
  {
    name: "Starter",
    price: "$49",
    priceNote: "/month",
    description: "For founder-led sales teams closing their first deals.",
    cta: "Get Started",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID",
    highlighted: true,
    features: [
      "1,000 contacts", "500 emails / month", "500 AI queries / month",
      "Automatic email capture", "ML-powered lead scoring", "3 connected mailboxes",
      "Outbound sequences", "Deal pipeline", "Email support",
    ],
  },
  {
    name: "Pro",
    price: "$99",
    priceNote: "/month",
    description: "Full autonomous GTM engine. Zero manual work.",
    cta: "Go Pro",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    highlighted: false,
    features: [
      "10,000 contacts", "5,000 emails / month", "Unlimited AI queries",
      "Automatic email capture", "ML-powered lead scoring", "Unlimited mailboxes",
      "Outbound sequences", "Deal pipeline + coaching", "Signal-based prioritization",
      "Auto-built TAM", "Priority support",
    ],
  },
];

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  // The tenant's real plan, so the right tier is marked "Current Plan" instead
  // of the value being hardcoded to Free Trial. null = unknown (still loading or
  // the fetch failed) → no tier is marked current (never render a wrong marker).
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/subscription");
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: string };
        if (!cancelled && data?.plan) setCurrentPlan(data.plan);
      } catch {
        // Network failure — leave the plan unknown rather than guess.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheckout(tier: Tier) {
    if (!tier.priceEnvKey) return;
    const priceId =
      tier.priceEnvKey === "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID"
        ? process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;
    if (!priceId) return;
    setLoadingTier(tier.name);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.warn("pricing: checkout failed", e);
    } finally { setLoadingTier(null); }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px]" style={{ color: "var(--color-text-tertiary)" }}>
          Start free. Upgrade when you need more power. All plans include a 14-day trial.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {tiers.map((tier) => {
          const ts = tierState(tier.name, currentPlan, tier.cta);
          return (
          <div
            key={tier.name}
            className="relative flex flex-col rounded-xl p-6"
            style={{
              background: "var(--color-bg-card)",
              border: tier.highlighted ? "2px solid var(--color-accent)" : "1px solid var(--color-border-default)",
            }}
          >
            {tier.highlighted && (
              <div className="gradient-brand absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-1 text-[11px] font-semibold text-white">
                Most Popular
              </div>
            )}

            <h3 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {tier.name}
            </h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[36px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
                {tier.price}
              </span>
              <span className="text-[14px]" style={{ color: "var(--color-text-tertiary)" }}>
                {tier.priceNote}
              </span>
            </div>
            <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
              {tier.description}
            </p>

            <Button
              variant={ts.isCurrent ? "outline" : tier.highlighted ? "gradient" : "outline"}
              className="mt-6 w-full"
              onClick={() => { if (ts.isUpgrade) handleCheckout(tier); }}
              disabled={ts.disabled || (ts.isUpgrade && !tier.priceEnvKey) || loadingTier === tier.name}
              loading={loadingTier === tier.name}
              icon={ts.isUpgrade && tier.highlighted && loadingTier !== tier.name ? <Zap size={14} /> : undefined}
            >
              {ts.label}
            </Button>

            <div className="my-6 h-px" style={{ background: "var(--color-border-default)" }} />

            <ul className="flex-1 space-y-2.5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          );
        })}
      </div>
    </div>
  );
}
