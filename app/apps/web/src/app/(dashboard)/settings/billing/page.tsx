"use client";

import { useState, useEffect } from "react";
import { CreditCard, ExternalLink, Zap, Mail, Users, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

interface SubscriptionData {
  status: string | null;
  plan: string;
  stripePriceId: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface UsageData {
  periodStart: string;
  periodEnd: string | null;
  usage: {
    api_call: number;
    email_sent: number;
    contact_enriched: number;
    ai_query: number;
  };
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Free Trial",
  starter: "Starter",
  pro: "Pro",
  canceled: "Canceled",
};

const PLAN_LIMITS: Record<string, { contacts: number; emails: number; ai: number }> = {
  trial: { contacts: 100, emails: 50, ai: 100 },
  starter: { contacts: 1000, emails: 500, ai: 500 },
  pro: { contacts: 10000, emails: 5000, ai: -1 }, // -1 = unlimited
};

export default function BillingSettingsPage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/usage").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/billing/subscription").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([usageData, subData]) => {
        setUsage(usageData);
        setSub(subData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const plan = sub?.plan ?? "trial";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;

  function trialDaysRemaining(): number | null {
    if (!sub?.trialEnd) return null;
    const end = new Date(sub.trialEnd);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      console.error("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleUpgrade(priceId: string) {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      console.error("Failed to start checkout");
    }
  }

  const trialDays = trialDaysRemaining();

  return (
    <>
      <h1
        className="text-[24px] font-semibold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        Billing
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage your subscription and view usage.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Loading billing information...
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* Current Plan Card */}
          <Card>
            <CardBody className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} style={{ color: "var(--color-accent)" }} />
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      Current Plan
                    </span>
                  </div>
                  <h2 className="mt-2 text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {PLAN_LABELS[plan] ?? plan}
                  </h2>

                  {sub?.status === "trialing" && trialDays !== null && (
                    <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {trialDays > 0
                        ? `${trialDays} day${trialDays === 1 ? "" : "s"} remaining in trial`
                        : "Trial has expired"}
                    </p>
                  )}

                  {sub?.cancelAtPeriodEnd && (
                    <p className="mt-1 text-[13px] text-amber-400">
                      Cancels at end of billing period
                    </p>
                  )}

                  {sub?.currentPeriodEnd && sub.status === "active" && (
                    <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Renews on{" "}
                      {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {(plan === "trial" || plan === "starter") && (
                    <Button
                      variant="gradient"
                      size="sm"
                      icon={<Zap size={13} />}
                      onClick={() =>
                        handleUpgrade(
                          plan === "trial"
                            ? (process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID ?? "")
                            : (process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "")
                        )
                      }
                    >
                      {plan === "trial" ? "Upgrade" : "Upgrade to Pro"}
                    </Button>
                  )}
                  {sub?.stripeCustomerId && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<ExternalLink size={13} />}
                      onClick={openPortal}
                      loading={portalLoading}
                    >
                      {portalLoading ? "Opening..." : "Manage"}
                    </Button>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Usage Section */}
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Usage this period
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <UsageMeter
                icon={<Users size={15} />}
                label="Contacts enriched"
                current={usage?.usage.contact_enriched ?? 0}
                limit={limits.contacts}
              />
              <UsageMeter
                icon={<Mail size={15} />}
                label="Emails sent"
                current={usage?.usage.email_sent ?? 0}
                limit={limits.emails}
              />
              <UsageMeter
                icon={<Brain size={15} />}
                label="AI queries"
                current={usage?.usage.ai_query ?? 0}
                limit={limits.ai}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UsageMeter({
  icon,
  label,
  current,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isNearLimit = !isUnlimited && pct >= 80;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
          {icon}
          <span className="text-[12px] font-medium">{label}</span>
        </div>
        <div className="mt-2">
          <span
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {current.toLocaleString()}
          </span>
          <span className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            {" "}
            / {isUnlimited ? "Unlimited" : limit.toLocaleString()}
          </span>
        </div>
        {!isUnlimited && (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: isNearLimit ? "var(--color-warning, #f59e0b)" : "var(--color-accent)",
              }}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
