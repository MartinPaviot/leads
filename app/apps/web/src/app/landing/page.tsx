"use client";

import Link from "next/link";
import {
  Zap,
  Brain,
  Mail,
  Target,
  BarChart3,
  Shield,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Auto-Built TAM",
    description:
      "Define your ICP in a conversation. We build your total addressable market automatically using real company data, ML scoring, and signal detection.",
  },
  {
    icon: Brain,
    title: "AI Deal Coaching",
    description:
      "Get coaching that references your actual pipeline data, meeting transcripts, and deal signals — not generic sales advice.",
  },
  {
    icon: Mail,
    title: "Autonomous Outbound",
    description:
      "Multi-step sequences with AI-generated, personalized emails. Mailbox warming, rotation, and deliverability monitoring built in.",
  },
  {
    icon: MessageSquare,
    title: "Chat-First CRM",
    description:
      "Ask your CRM anything in natural language. Get answers with citations to specific emails, meetings, and records.",
  },
  {
    icon: BarChart3,
    title: "Zero Data Entry",
    description:
      "Every email, meeting, and interaction is captured automatically. Your pipeline stays accurate without lifting a finger.",
  },
  {
    icon: Shield,
    title: "Customer Memory",
    description:
      "Schema-less data model captures everything. 2-year email backfill. 90%+ recall accuracy on any query about any contact.",
  },
];

const pricingTiers = [
  {
    name: "Trial",
    price: "Free",
    period: "14 days",
    description: "Try everything. No credit card required.",
    features: ["100 contacts", "50 emails / month", "100 AI queries / month", "Full feature access"],
    cta: "Start Free Trial",
    href: "/sign-in",
    primary: false,
  },
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    description: "For founders starting outbound.",
    features: ["1,000 contacts", "500 emails / month", "500 AI queries / month", "1 connected mailbox", "Email support"],
    cta: "Get Started",
    href: "/sign-in",
    primary: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For founders scaling pipeline.",
    features: [
      "10,000 contacts", "5,000 emails / month", "Unlimited AI queries",
      "5 connected mailboxes", "Priority support", "Custom signals", "API access",
    ],
    cta: "Get Started",
    href: "/sign-in",
    primary: true,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-page)" }}>
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="gradient-text text-xl font-bold tracking-tight">LeadSens</span>
        <div className="flex items-center gap-6">
          <Link href="#features" className="text-[13px] font-medium transition-colors" style={{ color: "var(--color-text-secondary)" }}>
            Features
          </Link>
          <Link href="#pricing" className="text-[13px] font-medium transition-colors" style={{ color: "var(--color-text-secondary)" }}>
            Pricing
          </Link>
          <Link
            href="/sign-in"
            className="gradient-brand rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-24 pt-20 text-center">
        <div
          className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <Zap size={12} />
          Built for founder-led sales
        </div>
        <h1 className="text-[48px] font-bold leading-[1.1] tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Your entire GTM engine,
          <br />
          <span className="gradient-text">on autopilot</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          LeadSens combines AI-powered CRM, autonomous outbound, and deal coaching
          into one tool. Auto-built TAM. Zero data entry. Chat-first interface.
          Built for founders who sell.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/sign-in"
            className="gradient-brand inline-flex items-center gap-2 rounded-lg px-7 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110"
          >
            Start Free Trial
            <ArrowRight size={16} />
          </Link>
          <Link
            href="#features"
            className="inline-flex items-center gap-2 rounded-lg px-7 py-3 text-[14px] font-medium transition-all"
            style={{
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            See Features
          </Link>
        </div>
        <p className="mt-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          14-day free trial. No credit card required.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="bg-grid mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Everything you need to close deals
          </h2>
          <p className="mt-3 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
            Enterprise-grade intelligence. Perfect memory. One tool.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-xl p-6 transition-all duration-200"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-default)",
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.currentTarget.style.borderColor = "var(--color-border-hover)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.currentTarget.style.borderColor = "var(--color-border-default)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  className="mb-3 inline-flex rounded-lg p-2.5"
                  style={{ background: "var(--color-accent-soft)" }}
                >
                  <Icon size={20} style={{ color: "var(--color-accent)" }} />
                </div>
                <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
            Start free. Upgrade when you're ready.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className="relative flex flex-col rounded-xl p-6"
              style={{
                background: "var(--color-bg-card)",
                border: tier.primary ? "2px solid var(--color-accent)" : "1px solid var(--color-border-default)",
              }}
            >
              {tier.primary && (
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
                  {tier.period}
                </span>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                {tier.description}
              </p>
              <ul className="mt-5 flex-1 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    <svg className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-[13px] font-semibold transition-all ${
                  tier.primary
                    ? "gradient-brand text-white shadow-sm hover:brightness-110"
                    : ""
                }`}
                style={!tier.primary ? {
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-primary)",
                } : undefined}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Ready to put your GTM on autopilot?
        </h2>
        <p className="mt-3 text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
          Join founders who closed their first deals without a single SDR.
        </p>
        <Link
          href="/sign-in"
          className="gradient-brand mt-8 inline-flex items-center gap-2 rounded-lg px-8 py-3.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110"
        >
          Start Free Trial
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--color-border-default)" }} className="py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <span className="gradient-text text-[14px] font-bold">LeadSens by Elevay</span>
          <div className="flex items-center gap-6 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link href="/acceptable-use" className="hover:underline">Acceptable Use</Link>
            <a href="mailto:support@elevay.dev" className="hover:underline">Support</a>
          </div>
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            &copy; {new Date().getFullYear()} Elevay SAS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
