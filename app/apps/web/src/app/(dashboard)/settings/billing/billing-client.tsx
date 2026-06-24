"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  ExternalLink,
  Zap,
  Mail,
  Users,
  BarChart3,
  Inbox,
  AlertTriangle,
  Clock,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  mailboxCount?: number;
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Free Trial",
  starter: "Starter",
  pro: "Pro",
  canceled: "Canceled",
};

const PLAN_PRICES: Record<string, string> = {
  trial: "Free",
  starter: "$49/mo",
  pro: "$149/mo",
  canceled: "--",
};

const PLAN_LIMITS: Record<
  string,
  { contacts: number; emails: number; ai: number; mailboxes: number }
> = {
  trial: { contacts: 100, emails: 50, ai: 100, mailboxes: 1 },
  starter: { contacts: 1000, emails: 500, ai: 500, mailboxes: 3 },
  pro: { contacts: 10000, emails: 5000, ai: -1, mailboxes: -1 },
};

const PLAN_BADGE_VARIANT: Record<
  string,
  "success" | "warning" | "error" | "info" | "neutral"
> = {
  trial: "info",
  starter: "success",
  pro: "success",
  canceled: "error",
};

export default function BillingClient() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/usage").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/billing/subscription").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([usageData, subData]) => {
        setUsage(usageData);
        setSub(subData);
      })
      .catch(() => setError("Failed to load billing data."))
      .finally(() => setLoading(false));
  }, []);

  const plan = sub?.plan ?? "trial";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
  const stripeConfigured =
    typeof process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID === "string" &&
    process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID.length > 0;

  function trialDaysRemaining(): number | null {
    if (!sub?.trialEnd) return null;
    const end = new Date(sub.trialEnd);
    const now = new Date();
    const days = Math.ceil(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return days > 0 ? days : 0;
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleUpgrade(priceId: string) {
    setCheckoutLoading(priceId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Failed to start checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  const trialDays = trialDaysRemaining();
  const starterPriceId =
    process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID ?? "";
  const proPriceId = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "";

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-[24px] font-semibold"
          style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
        >
          Billing
        </h1>
        <p
          className="mt-1.5 text-[13px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Manage your subscription, view usage, and access invoices.
        </p>
      </header>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: "var(--color-error-soft)",
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
          }}
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!stripeConfigured && !loading && (
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: "var(--color-warning-soft)",
                  color: "var(--color-warning)",
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div>
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Billing not configured
                </p>
                <p
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Stripe API keys are not set. Add{" "}
                  <code
                    className="rounded px-1 py-0.5 text-[11px]"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    STRIPE_SECRET_KEY
                  </code>{" "}
                  and price IDs to your environment to enable billing.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div
          className="flex items-center gap-2 py-12 text-[13px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-current"
            style={{ borderTopColor: "transparent" }}
          />
          Loading billing information...
        </div>
      ) : (
        <>
          {/* ── Current Plan ── */}
          <Card>
            <CardBody className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard
                      size={16}
                      style={{ color: "var(--color-accent)" }}
                    />
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Current plan
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <h2
                      className="text-[22px] font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {PLAN_LABELS[plan] ?? plan}
                    </h2>
                    <Badge variant={PLAN_BADGE_VARIANT[plan] ?? "neutral"}>
                      {PLAN_PRICES[plan] ?? ""}
                    </Badge>
                  </div>

                  {sub?.status === "trialing" && trialDays !== null && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Clock
                        size={13}
                        style={{
                          color:
                            trialDays <= 3
                              ? "var(--color-warning)"
                              : "var(--color-text-tertiary)",
                        }}
                      />
                      <p
                        className="text-[13px]"
                        style={{
                          color:
                            trialDays <= 3
                              ? "var(--color-warning)"
                              : "var(--color-text-tertiary)",
                        }}
                      >
                        {trialDays > 0
                          ? `${trialDays} day${trialDays === 1 ? "" : "s"} remaining in trial`
                          : "Trial has expired"}
                      </p>
                    </div>
                  )}

                  {sub?.cancelAtPeriodEnd && (
                    <p
                      className="mt-1.5 text-[13px]"
                      style={{ color: "var(--color-warning)" }}
                    >
                      Cancels at end of billing period
                    </p>
                  )}

                  {sub?.currentPeriodEnd &&
                    sub.status === "active" &&
                    !sub.cancelAtPeriodEnd && (
                      <p
                        className="mt-1.5 text-[13px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        Renews on{" "}
                        {new Date(sub.currentPeriodEnd).toLocaleDateString(
                          "en-US",
                          {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {sub?.stripeCustomerId && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<ExternalLink size={13} />}
                        onClick={openPortal}
                        loading={portalLoading}
                      >
                        Manage subscription
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Receipt size={13} />}
                        onClick={openPortal}
                      >
                        Billing history
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* ── Upgrade CTAs ── */}
          {(plan === "trial" || plan === "starter") && stripeConfigured && (
            <div>
              <h3
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Upgrade your plan
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plan === "trial" && (
                  <UpgradeCard
                    name="Starter"
                    price="$49/mo"
                    features={[
                      "1,000 contacts",
                      "500 emails/month",
                      "500 AI queries/month",
                      "3 connected mailboxes",
                    ]}
                    onUpgrade={() => handleUpgrade(starterPriceId)}
                    loading={checkoutLoading === starterPriceId}
                    disabled={!starterPriceId}
                  />
                )}
                <UpgradeCard
                  name="Pro"
                  price="$149/mo"
                  features={[
                    "10,000 contacts",
                    "5,000 emails/month",
                    "Unlimited AI queries",
                    "Unlimited mailboxes",
                  ]}
                  onUpgrade={() => handleUpgrade(proPriceId)}
                  loading={checkoutLoading === proPriceId}
                  disabled={!proPriceId}
                  recommended
                />
              </div>
            </div>
          )}

          {/* ── Usage ── */}
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Usage this period
            </h3>
            {usage?.periodStart && (
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Since{" "}
                {new Date(usage.periodStart).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                {usage.periodEnd &&
                  ` through ${new Date(usage.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <UsageMeter
                icon={<Users size={15} />}
                label="Contacts"
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
                icon={<BarChart3 size={15} />}
                label="AI queries"
                current={usage?.usage.ai_query ?? 0}
                limit={limits.ai}
              />
              <UsageMeter
                icon={<Inbox size={15} />}
                label="Mailboxes"
                current={usage?.mailboxCount ?? 0}
                limit={limits.mailboxes}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Upgrade Card ── */

function UpgradeCard({
  name,
  price,
  features,
  onUpgrade,
  loading,
  disabled,
  recommended,
}: {
  name: string;
  price: string;
  features: string[];
  onUpgrade: () => void;
  loading: boolean;
  disabled: boolean;
  recommended?: boolean;
}) {
  return (
    <Card
      style={
        recommended
          ? { border: "1px solid var(--color-accent)" }
          : undefined
      }
    >
      <CardBody className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {name}
            </span>
            {recommended && (
              <Badge variant="success" className="ml-2">
                Recommended
              </Badge>
            )}
          </div>
          <span
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {price}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {features.map((f) => (
            <li
              key={f}
              className="text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Button
            variant={recommended ? "gradient" : "solid"}
            size="sm"
            icon={<Zap size={13} />}
            onClick={onUpgrade}
            loading={loading}
            disabled={disabled}
            className="w-full"
          >
            Upgrade to {name}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* ── Usage Meter ── */

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
  const pct =
    isUnlimited ? 0 : limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && pct >= 100;

  return (
    <Card>
      <CardBody>
        <div
          className="flex items-center gap-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {icon}
          <span className="text-[12px] font-medium">{label}</span>
        </div>
        <div className="mt-2">
          <span
            className="text-[18px] font-semibold"
            style={{
              color: isAtLimit
                ? "var(--color-error)"
                : "var(--color-text-primary)",
            }}
          >
            {current.toLocaleString()}
          </span>
          <span
            className="text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
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
                background: isAtLimit
                  ? "var(--color-error, #ef4444)"
                  : isNearLimit
                    ? "var(--color-warning, #f59e0b)"
                    : "var(--color-accent)",
              }}
            />
          </div>
        )}
        {isAtLimit && (
          <p
            className="mt-1.5 text-[11px]"
            style={{ color: "var(--color-error)" }}
          >
            Limit reached
          </p>
        )}
      </CardBody>
    </Card>
  );
}
