"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  Mail,
  MessageSquare,
  BarChart3,
  ChevronDown,
  Play,
  Inbox,
  Search,
  Users,
  Send,
  ListChecks,
  Clock,
  RefreshCw,
  Check,
} from "lucide-react";

/* =================================================================
   ANIMATION HELPERS
   ================================================================= */

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px 0px" });

  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {children}
    </motion.section>
  );
}

function Animate({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeInUp}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/* =================================================================
   FEATURE SHOWCASE DATA
   ================================================================= */

const showcaseFeatures = [
  {
    num: "01",
    title: "Your CRM updates itself",
    desc: "Every email, meeting, and note is captured and organized automatically. No more manual data entry.",
    icon: Inbox,
  },
  {
    num: "02",
    title: "Ask anything about your customers",
    desc: "Natural language queries with citations to the original email, call, or meeting.",
    icon: Search,
  },
  {
    num: "03",
    title: "Build your pipeline automatically",
    desc: "Describe your ideal customer. LeadSens finds, scores, and prioritizes every match.",
    icon: Users,
  },
  {
    num: "04",
    title: "Send personalized outreach at scale",
    desc: "AI writes emails based on what you've actually discussed — not templates.",
    icon: Send,
  },
  {
    num: "05",
    title: "Know exactly what to do next",
    desc: "Prioritized actions based on deal signals, engagement, and pipeline health.",
    icon: ListChecks,
  },
  {
    num: "06",
    title: "Prep for every meeting in seconds",
    desc: "Full context on every contact — history, deals, sentiment — summarized before you walk in.",
    icon: Clock,
  },
  {
    num: "07",
    title: "Revive stalled deals",
    desc: "Automatic detection of stale deals with AI-generated revival emails ready to send.",
    icon: RefreshCw,
  },
];

/* =================================================================
   FAQ DATA
   ================================================================= */

const faqs = [
  {
    q: "How is this different from HubSpot?",
    a: "HubSpot is a database you update manually. LeadSens captures everything automatically from your email and meetings, finds new customers for you, and writes your outreach. It's the CRM that does the work.",
  },
  {
    q: "Do I need a sales team?",
    a: "No. LeadSens is built for founders doing founder-led sales. One person, one tool, full pipeline.",
  },
  {
    q: "How does the AI know about my customers?",
    a: "It reads your email and meeting transcripts (with your permission) and builds a complete memory of every conversation. When you ask a question, it answers with citations to the original source.",
  },
  {
    q: "Is my data secure?",
    a: "Your data is encrypted at rest and in transit. We never share your data or use it to train models. SOC 2 compliance is in progress.",
  },
  {
    q: "Can I import from my current CRM?",
    a: "Yes. CSV import works out of the box. HubSpot and Salesforce direct migration coming soon.",
  },
  {
    q: "What if I want to cancel?",
    a: "Cancel anytime. Your data is exportable. No lock-in.",
  },
];

/* =================================================================
   PRICING DATA
   ================================================================= */

const pricingTiers = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    description: "For solo founders getting started",
    features: ["100 contacts", "Email sync", "AI chat", "Basic pipeline"],
    cta: "Get started free",
    primary: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/mo",
    description: "For founders scaling outbound",
    features: [
      "Unlimited contacts",
      "TAM builder",
      "AI sequences",
      "Deal coaching",
      "Priority support",
    ],
    cta: "Start 14-day trial",
    primary: true,
  },
  {
    name: "Team",
    price: "$99",
    period: "/mo",
    description: "For growing sales teams",
    features: [
      "Everything in Growth",
      "Multi-user (up to 10)",
      "Advanced permissions",
      "Workflow automation",
      "Dedicated onboarding",
    ],
    cta: "Start 14-day trial",
    primary: false,
  },
];

/* =================================================================
   FAQ ITEM COMPONENT
   ================================================================= */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left transition-colors hover:text-gray-900"
      >
        <span className="pr-8 text-base font-medium text-gray-900">{q}</span>
        <ChevronDown
          size={20}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-[15px] leading-relaxed text-gray-500">{a}</p>
      </div>
    </div>
  );
}

/* =================================================================
   MAIN PAGE
   ================================================================= */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen w-full bg-white">
      {/* NAV */}
      <nav className={`fixed top-0 z-50 w-full transition-all duration-300 ${scrolled ? "bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md" : "bg-transparent"}`}>
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>LeadSens</Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#features" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Features</Link>
            <Link href="#pricing" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Pricing</Link>
            <Link href="/docs" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Docs</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Log in</Link>
            <Link href="/sign-up" className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Try free</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <Section className="relative pb-24 pt-[140px]">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative mx-auto max-w-[1400px] px-6 text-center">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-500">Get started in minutes</p></Animate>
          <Animate><h1 className="mx-auto mt-6 max-w-[800px] text-[28px] font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">Your CRM finds customers, remembers everything, and does the work for you.</h1></Animate>
          <Animate><p className="mx-auto mt-6 max-w-[600px] text-lg leading-relaxed text-gray-500">Connect your email. Describe your ideal customer. LeadSens builds your pipeline, captures every conversation, and tells you exactly who to call next.</p></Animate>
          <Animate>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sign-up" className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Try for free</Link>
              <Link href="#demo" className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400"><Play size={14} className="text-gray-500" />Watch demo</Link>
            </div>
          </Animate>
          <Animate>
            <div className="mx-auto mt-16 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
                <div className="flex gap-1.5"><div className="h-3 w-3 rounded-full bg-gray-200" /><div className="h-3 w-3 rounded-full bg-gray-200" /><div className="h-3 w-3 rounded-full bg-gray-200" /></div>
                <div className="mx-auto rounded-md bg-gray-100 px-4 py-1 text-xs text-gray-400">app.leadsens.com</div>
              </div>
              <div className="flex" style={{ height: "480px" }}>
                <div className="hidden w-[200px] shrink-0 border-r border-gray-200 bg-white p-4 md:block">
                  <div className="mb-6 text-sm font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>LeadSens</div>
                  {["Chat", "Pipeline", "Contacts", "Sequences", "Settings"].map((item, i) => (<div key={item} className={`mb-1 rounded-md px-3 py-2 text-xs font-medium ${i === 0 ? "bg-blue-50 text-blue-700" : "text-gray-500"}`}>{item}</div>))}
                </div>
                <div className="flex-1 overflow-hidden bg-gray-50 p-6">
                  <div className="mb-4 text-sm font-semibold text-gray-700">Chat</div>
                  <div className="space-y-3">
                    <div className="flex gap-3"><div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 text-center text-xs font-bold leading-7 text-blue-600">Y</div><div className="rounded-lg bg-white px-4 py-2.5 text-xs text-gray-700 shadow-sm">Who are my top 5 prospects this week?</div></div>
                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #17C3B2, #2C6BED)" }}>L</div>
                      <div className="max-w-[480px] rounded-lg bg-white px-4 py-2.5 text-xs leading-relaxed text-gray-700 shadow-sm">
                        Based on engagement signals and deal stage, here are your top 5 this week:
                        <div className="mt-2 space-y-1.5">
                          {[{ name: "Acme Corp", score: "94", reason: "Replied to sequence, opened pricing page" }, { name: "TechFlow", score: "89", reason: "Meeting scheduled Thursday" }, { name: "Noven AI", score: "85", reason: "Downloaded whitepaper, 3 page views" }, { name: "BrightPath", score: "82", reason: "Email opened 4x, clicked demo link" }, { name: "Relay Labs", score: "78", reason: "Founder connected on LinkedIn" }].map((p) => (
                            <div key={p.name} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5"><span className="font-medium text-gray-900">{p.name}</span><span className="text-[10px] text-gray-400">Score: {p.score} — {p.reason}</span></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5"><span className="flex-1 text-xs text-gray-400">Ask LeadSens anything...</span><div className="rounded-md px-3 py-1 text-[10px] font-semibold text-white" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)" }}>Send</div></div>
                </div>
              </div>
            </div>
          </Animate>
        </div>
      </Section>

      {/* GRADIENT SEPARATOR */}
      <div className="mx-auto max-w-[1400px] px-6"><div className="h-px" style={{ background: "linear-gradient(90deg, transparent, #17C3B2, #2C6BED, #FF7A3D, transparent)" }} /></div>

      {/* WHY LEADSENS */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="max-w-3xl">
            <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">Why LeadSens</p></Animate>
            <Animate><h2 className="mt-4 text-3xl font-bold leading-snug tracking-tight text-gray-900">Traditional CRMs make you do the work.<br />LeadSens does it for you.</h2></Animate>
            <Animate><p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-500">You shouldn&apos;t spend hours logging notes, updating fields, and guessing who to call next. LeadSens connects to your email, learns your customers, finds new ones, and runs your outbound — so you can focus on closing.</p></Animate>
          </div>
        </div>
      </Section>

      {/* FOUNDATIONS */}
      <Section className="pt-24">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">Foundations</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">Everything you need to sell, in one place</h2></Animate>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[{ icon: Mail, title: "Auto-capture everything", body: "Every email, meeting, and note — captured and organized automatically. Your CRM is always up to date without typing a word." }, { icon: BarChart3, title: "Find your next 50 customers", body: "Describe your ideal customer. LeadSens searches real databases, scores every match, and tells you exactly why each company is a fit." }, { icon: MessageSquare, title: "Outreach that sounds like you", body: "AI writes emails based on what you've actually discussed with each prospect. Not templates. Real conversations." }].map((card) => { const Icon = card.icon; return (
              <Animate key={card.title}><div className="rounded-xl border border-gray-200 bg-white p-8 transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"><div className="mb-4 inline-flex rounded-lg border border-gray-100 bg-gray-50 p-2.5"><Icon size={20} className="text-gray-600" /></div><h3 className="text-base font-semibold text-gray-900">{card.title}</h3><p className="mt-2 text-sm leading-relaxed text-gray-500">{card.body}</p></div></Animate>
            ); })}
          </div>
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features" className="pt-32">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">Features</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">What you can do with LeadSens</h2></Animate>
          <div className="mt-12 grid gap-8 lg:grid-cols-[380px_1fr] lg:gap-12">
            <Animate>
              <div className="space-y-1">
                {showcaseFeatures.map((f, i) => { const Icon = f.icon; return (
                  <button key={f.num} onClick={() => setActiveFeature(i)} className={`group flex w-full items-start gap-4 rounded-xl px-5 py-4 text-left transition-all duration-200 ${activeFeature === i ? "bg-gray-50" : "hover:bg-gray-50/50"}`}>
                    <span className={`mt-0.5 text-xs font-semibold tabular-nums ${activeFeature === i ? "text-blue-600" : "text-gray-300"}`}>{f.num}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><Icon size={16} className={activeFeature === i ? "text-blue-600" : "text-gray-400"} /><span className={`text-sm font-semibold ${activeFeature === i ? "text-gray-900" : "text-gray-600"}`}>{f.title}</span></div>
                      {activeFeature === i && <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{f.desc}</p>}
                    </div>
                  </button>
                ); })}
              </div>
            </Animate>
            <Animate>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5"><div className="flex gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-gray-200" /><div className="h-2.5 w-2.5 rounded-full bg-gray-200" /><div className="h-2.5 w-2.5 rounded-full bg-gray-200" /></div></div>
                <div className="p-6">
                  {activeFeature === 0 && <MockAutoCapture />}
                  {activeFeature === 1 && <MockChat />}
                  {activeFeature === 2 && <MockPipeline />}
                  {activeFeature === 3 && <MockOutreach />}
                  {activeFeature === 4 && <MockActions />}
                  {activeFeature === 5 && <MockMeetingPrep />}
                  {activeFeature === 6 && <MockStaleDeal />}
                </div>
              </div>
            </Animate>
          </div>
        </div>
      </Section>

      {/* PRICING */}
      <Section id="pricing" className="pt-32 text-center">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate><h2 className="text-3xl font-bold tracking-tight text-gray-900">Simple, founder-friendly pricing</h2></Animate>
          <div className="mx-auto mt-12 grid max-w-[960px] gap-6 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <Animate key={tier.name}>
              <div
                className={`relative flex flex-col rounded-xl border bg-white p-8 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] ${
                  tier.primary
                    ? "border-transparent shadow-lg"
                    : "border-gray-200"
                }`}
              >
                {tier.primary && (
                  <div
                    className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
                    style={{
                      background:
                        "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                    }}
                  />
                )}

                <h3 className="text-sm font-semibold text-gray-900">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-gray-900">
                    {tier.price}
                  </span>
                  <span className="text-sm text-gray-400">{tier.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {tier.description}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2.5 text-sm text-gray-600"
                    >
                      <Check size={16} className="shrink-0 text-gray-400" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-up"
                  className={`mt-8 block rounded-lg py-2.5 text-center text-sm font-semibold transition-opacity ${
                    tier.primary
                      ? "text-white hover:opacity-90"
                      : "border border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                  style={
                    tier.primary
                      ? {
                          background:
                            "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                          backgroundSize: "120% 100%",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {tier.cta}
                </Link>
              </div>
            </Animate>
          ))}
          </div>

          <Animate>
            <p className="mt-8 text-sm text-gray-400">
              14-day free trial. No credit card required.
            </p>
          </Animate>
        </div>
      </Section>

      {/* ============================================================
          SECTION 8: FAQ
          ============================================================ */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[720px] px-6">
          <Animate>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Questions
            </h2>
          </Animate>
          <Animate>
            <div className="mt-8">
              {faqs.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </Animate>
        </div>
      </Section>

      {/* ============================================================
          SECTION 9: FINAL CTA
          ============================================================ */}
      <Section className="mt-32">
        <div
          className="py-24"
          style={{
            background:
              "linear-gradient(180deg, rgba(23,195,178,0.03) 0%, rgba(44,107,237,0.03) 50%, rgba(255,255,255,1) 100%)",
          }}
        >
          <div className="mx-auto max-w-[1400px] px-6 text-center">
            <Animate>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Stop updating your CRM.
                <br />
                Start closing deals.
              </h2>
            </Animate>
            <Animate>
              <p className="mt-4 text-lg text-gray-500">
                Free to start. Set up in 3 minutes.
              </p>
            </Animate>
            <Animate>
              <div className="mt-8">
                <Link
                  href="/sign-up"
                  className="inline-block rounded-lg px-8 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{
                    background:
                      "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                    backgroundSize: "120% 100%",
                    backgroundPosition: "center",
                  }}
                >
                  Get started free
                </Link>
              </div>
            </Animate>
            <Animate>
              <p className="mt-4 text-xs text-gray-400">
                No credit card required
              </p>
            </Animate>
          </div>
        </div>
      </Section>

      {/* ============================================================
          SECTION 10: FOOTER
          ============================================================ */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-[1400px] px-6 pb-8 pt-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <span
              className="text-base font-bold"
              style={{
                background:
                  "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                backgroundSize: "120% 100%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              LeadSens
            </span>

            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { label: "Product", href: "#features" },
                { label: "Pricing", href: "#pricing" },
                { label: "Docs", href: "/docs" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-gray-500 transition-colors hover:text-gray-700"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Twitter"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="GitHub"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            &copy; 2026 LeadSens. Made in San Francisco.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* =================================================================
   FEATURE MOCKUP COMPONENTS
   ================================================================= */

function MockAutoCapture() {
  const events = [
    {
      type: "email",
      time: "2 min ago",
      title: "Re: Q2 proposal follow-up",
      contact: "Sarah Chen — Acme Corp",
      auto: true,
    },
    {
      type: "meeting",
      time: "1 hour ago",
      title: "Discovery call — TechFlow",
      contact: "James Park — TechFlow",
      auto: true,
    },
    {
      type: "email",
      time: "3 hours ago",
      title: "Introduction from David",
      contact: "Maria Lopez — Noven AI",
      auto: true,
    },
    {
      type: "note",
      time: "Yesterday",
      title: "Pricing feedback from demo",
      contact: "Alex Kim — BrightPath",
      auto: false,
    },
  ];

  return (
    <div>
      <div className="mb-4 text-xs font-semibold text-gray-500">
        Activity Timeline
      </div>
      <div className="space-y-3">
        {events.map((e) => (
          <div
            key={e.title}
            className="flex items-start gap-3 rounded-lg bg-white p-3"
          >
            <div
              className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                e.type === "email"
                  ? "bg-blue-400"
                  : e.type === "meeting"
                    ? "bg-green-400"
                    : "bg-amber-400"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium text-gray-900">
                  {e.title}
                </span>
                {e.auto && (
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    Auto-captured
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {e.contact} · {e.time}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockChat() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="h-6 w-6 shrink-0 rounded-full bg-blue-100 text-center text-[10px] font-bold leading-6 text-blue-600">
          Y
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700 shadow-sm">
          When did we last talk to Acme Corp about pricing?
        </div>
      </div>
      <div className="flex gap-3">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #17C3B2, #2C6BED)" }}
        >
          L
        </div>
        <div className="max-w-[360px] rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-gray-700 shadow-sm">
          <p>
            You discussed pricing with <strong>Sarah Chen</strong> (Acme Corp)
            on <strong>March 28</strong> via email.
          </p>
          <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            <span className="font-medium text-gray-600">Source:</span> Email —
            &quot;Re: Q2 proposal follow-up&quot; — Mar 28, 2:14 PM
          </div>
          <p className="mt-2">
            She asked for a 15% volume discount for 50+ seats. You offered 10%
            and she said she&apos;d check with her CFO.
          </p>
        </div>
      </div>
    </div>
  );
}

function MockPipeline() {
  const accounts = [
    {
      name: "Acme Corp",
      score: 94,
      industry: "SaaS",
      signal: "High engagement",
    },
    {
      name: "TechFlow",
      score: 89,
      industry: "DevTools",
      signal: "Meeting booked",
    },
    {
      name: "Noven AI",
      score: 85,
      industry: "AI/ML",
      signal: "Content download",
    },
    {
      name: "BrightPath",
      score: 82,
      industry: "EdTech",
      signal: "Demo requested",
    },
    {
      name: "Relay Labs",
      score: 78,
      industry: "Logistics",
      signal: "Social connect",
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          TAM — Top Matches
        </span>
        <span className="text-[10px] text-gray-400">142 companies scored</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-500">
                Company
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">
                Score
              </th>
              <th className="hidden px-3 py-2 text-left font-medium text-gray-500 sm:table-cell">
                Industry
              </th>
              <th className="hidden px-3 py-2 text-left font-medium text-gray-500 md:table-cell">
                Signal
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.name} className="border-b border-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">
                  {a.name}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.score >= 90
                        ? "bg-green-50 text-green-700"
                        : a.score >= 80
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {a.score}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-gray-500 sm:table-cell">
                  {a.industry}
                </td>
                <td className="hidden px-3 py-2 text-gray-500 md:table-cell">
                  {a.signal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockOutreach() {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold text-gray-500">
        AI-Generated Email Draft
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-3 space-y-1.5 border-b border-gray-100 pb-3 text-[11px] text-gray-400">
          <div>
            <span className="font-medium text-gray-500">To:</span>{" "}
            sarah.chen@acmecorp.com
          </div>
          <div>
            <span className="font-medium text-gray-500">Subject:</span>{" "}
            Following up on the volume discount
          </div>
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-gray-700">
          <p>Hi Sarah,</p>
          <p>
            Hope your week is going well. I wanted to circle back on the volume
            pricing we discussed — I know you were checking with your CFO about
            the 50-seat plan.
          </p>
          <p>
            I&apos;ve put together a quick breakdown showing the per-seat cost
            at 10% vs. what a phased rollout might look like. Happy to walk
            through it whenever works.
          </p>
          <p>
            Best,
            <br />
            You
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">
            Personalized from 3 prior emails
          </span>
        </div>
      </div>
    </div>
  );
}

function MockActions() {
  const actions = [
    {
      priority: "high",
      action: "Follow up with Sarah Chen (Acme)",
      reason: "No reply in 5 days, deal at risk",
      type: "Email",
    },
    {
      priority: "high",
      action: "Prep for TechFlow discovery call",
      reason: "Meeting in 2 hours",
      type: "Meeting",
    },
    {
      priority: "medium",
      action: "Send intro to Noven AI contact",
      reason: "Warm referral from David",
      type: "Email",
    },
    {
      priority: "medium",
      action: "Review BrightPath proposal feedback",
      reason: "Received yesterday, unread",
      type: "Review",
    },
    {
      priority: "low",
      action: "Update Relay Labs deal stage",
      reason: "LinkedIn connection accepted",
      type: "CRM",
    },
  ];

  return (
    <div>
      <div className="mb-3 text-xs font-semibold text-gray-500">
        Prioritized Actions — Today
      </div>
      <div className="space-y-2">
        {actions.map((a) => (
          <div
            key={a.action}
            className="flex items-start gap-3 rounded-lg bg-white p-3"
          >
            <div
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                a.priority === "high"
                  ? "bg-red-400"
                  : a.priority === "medium"
                    ? "bg-amber-400"
                    : "bg-gray-300"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-900">
                {a.action}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {a.reason}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {a.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockMeetingPrep() {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold text-gray-500">
        Meeting Prep — TechFlow Discovery
      </div>
      <div className="space-y-3">
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Contact
          </div>
          <div className="mt-1 text-xs font-medium text-gray-900">
            James Park — Head of Engineering
          </div>
          <div className="mt-0.5 text-[11px] text-gray-400">
            Met at SaaStr Annual 2025. Connected via LinkedIn.
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Key context
          </div>
          <ul className="mt-1 space-y-1 text-xs text-gray-600">
            <li>• Evaluating CRMs to replace Pipedrive</li>
            <li>• Team of 8 SDRs, growing to 15 by Q3</li>
            <li>• Main pain: manual data entry taking 2h/day per rep</li>
          </ul>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Suggested talking points
          </div>
          <ul className="mt-1 space-y-1 text-xs text-gray-600">
            <li>• Demo auto-capture — directly addresses their pain</li>
            <li>• Show team features — they&apos;re scaling</li>
            <li>• Compare Pipedrive migration path</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function MockStaleDeal() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          Stale Deal Detection
        </span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
          3 deals at risk
        </span>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-900">
              Acme Corp — Q2 Proposal
            </span>
            <span className="text-[10px] font-medium text-red-500">
              12 days silent
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Last contact: Sarah Chen, Mar 28 (email about pricing)
          </div>
          <div className="mt-2 rounded-md bg-blue-50 p-2">
            <div className="text-[10px] font-medium text-blue-700">
              AI-suggested revival:
            </div>
            <div className="mt-1 text-[11px] text-blue-600">
              &quot;Hi Sarah, I put together that per-seat breakdown you
              mentioned. Quick 10-min call this week?&quot;
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md px-3 py-1 text-[10px] font-semibold text-white"
              style={{
                background:
                  "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
              }}
            >
              Send email
            </button>
            <button className="rounded-md border border-gray-200 px-3 py-1 text-[10px] font-medium text-gray-600">
              Edit draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
