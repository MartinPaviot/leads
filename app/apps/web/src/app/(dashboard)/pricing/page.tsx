"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TIERS, PUBLIC_TIER_IDS, type TierSpec } from "@/lib/pricing/tiers";

const tiers: TierSpec[] = PUBLIC_TIER_IDS.map((id) => TIERS[id]);

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  async function handleCheckout(tier: TierSpec) {
    if (!tier.priceEnvKey) return;
    // NEXT_PUBLIC_* env reads must be literal string references — Next's
    // client-side inlining can't follow a dynamic key.
    const priceId =
      tier.priceEnvKey === "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID"
        ? process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID
        : tier.priceEnvKey === "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID"
          ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
          : undefined;
    if (!priceId) return;
    setLoadingTier(tier.displayName);
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
        {tiers.map((tier) => (
          <div
            key={tier.displayName}
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
              {tier.displayName}
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
              variant={tier.highlighted ? "gradient" : "outline"}
              className="mt-6 w-full"
              onClick={() => handleCheckout(tier)}
              disabled={!tier.priceEnvKey || loadingTier === tier.displayName}
              loading={loadingTier === tier.displayName}
              icon={tier.highlighted && loadingTier !== tier.displayName ? <Zap size={14} /> : undefined}
            >
              {tier.cta}
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
        ))}
      </div>
    </div>
  );
}
