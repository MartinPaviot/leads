"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  Mail,
  MessageSquare,
  BarChart3,
  ChevronDown,
  Inbox,
  Search,
  Users,
  Send,
  ListChecks,
  Clock,
  Play,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";

const CALENDLY_URL = "https://calendly.com/contact-elevay/30min";

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
  // L15 — respect prefers-reduced-motion. When the user opts out of
  // motion at the OS level, we render the section as-is from the start
  // (no fade-in / slide-up) instead of letting the animation chain
  // play. Framer's hook returns null on the server, which is why the
  // fallback `?? false` matters.
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial={reduced ? "visible" : "hidden"}
      animate={reduced ? "visible" : inView ? "visible" : "hidden"}
      variants={{
        visible: { transition: { staggerChildren: reduced ? 0 : 0.1 } },
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
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={fadeInUp}
      transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/* =================================================================
   HOW IT WORKS DATA
   ================================================================= */

const steps = [
  {
    num: "01",
    title: "Connect your email",
    desc: "One click to link Gmail or Outlook. Elevay syncs your emails, calendar, and contacts — automatically.",
    icon: Inbox,
  },
  {
    num: "02",
    title: "An AI bot joins your calls",
    desc: "Elevay auto-joins Google Meet, Zoom, and Teams. It records, transcribes, and extracts buying signals — budget, timeline, competitors, objections.",
    icon: Play,
  },
  {
    num: "03",
    title: "Review and confirm",
    desc: "After each call, review the extracted data — action items, deal intel, matched contacts — and confirm with one click before it enters your CRM.",
    icon: ListChecks,
  },
  {
    num: "04",
    title: "Ask anything about your pipeline",
    desc: "Natural language queries with citations. \"What did Sarah say about budget last Thursday?\" — answered with the exact email or call transcript.",
    icon: Search,
  },
  {
    num: "05",
    title: "Build your TAM automatically",
    desc: "Define your ideal customer. Elevay searches real databases, scores every company, and builds your target account list — ready for outreach.",
    icon: Users,
  },
  {
    num: "06",
    title: "Send personalized sequences",
    desc: "AI writes outreach from real meeting notes and email threads. Follow-ups based on what was actually discussed, not templates.",
    icon: Send,
  },
  {
    num: "07",
    title: "Walk into meetings prepared",
    desc: "24 hours before each call, get a full brief: who you're meeting, deal history, recent interactions, talking points, potential objections.",
    icon: Clock,
  },
];

/* =================================================================
   FAQ DATA
   ================================================================= */

const faqs = [
  {
    q: "How is this different from HubSpot or Salesforce?",
    a: "They're databases you update manually. Elevay captures every email, joins your calls with a bot, transcribes and extracts deal intel automatically, and writes your follow-ups. You review and confirm — it does the rest.",
  },
  {
    q: "How does the meeting bot work?",
    a: "When you have a meeting with a Google Meet, Zoom, or Teams link in your calendar, Elevay automatically sends a bot to join and record. After the call, it extracts structured notes, buying signals, action items, and lets you review before updating your CRM.",
  },
  {
    q: "Do I need a sales team?",
    a: "No. Elevay is built for founders doing founder-led sales. One person, one tool, full pipeline — from finding leads to closing deals.",
  },
  {
    q: "How does the AI know about my customers?",
    a: "It syncs your email and calendar, transcribes your calls, and builds a complete memory of every conversation. When you ask a question, it answers with citations to the original email, call, or meeting.",
  },
  {
    q: "Is my data secure?",
    a: "Your data is encrypted at rest and in transit. We use OAuth to connect — we never store your email password. You can revoke access anytime from your Google or Microsoft account.",
  },
];

/* =================================================================
   FAQ ITEM COMPONENT
   ================================================================= */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  // L10 — stable id derived from the question so screen readers get a
  // meaningful aria-controls target. Slug-cased to keep it valid HTML
  // id syntax and human-readable in DevTools.
  const slug = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const buttonId = `faq-button-${slug}`;
  const panelId = `faq-panel-${slug}`;

  return (
    <div className="border-b border-gray-200">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left transition-colors hover:text-gray-900"
      >
        <span className="pr-8 text-base font-medium text-gray-900">{q}</span>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
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
  // L5 — mobile menu open state. Lives at the page level so the close
  // handler can target it from anywhere (overlay tap, ESC key, link
  // click). Body scroll is locked while the menu is open so the page
  // behind the sheet doesn't drift.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-white">
      {/* NAV */}
      <nav
        aria-label="Primary"
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md" : "bg-white"}`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-Elevay.svg" alt="Elevay" className="h-7 w-7" />
            <span className="text-xl font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">How it works</Link>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Book a demo</a>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Log in</Link>
            <Link href="/sign-up" className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Try free</Link>
          </div>
          {/* L5 — mobile hamburger. Visible below md only. */}
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-md p-2 text-gray-700 hover:bg-gray-100 md:hidden"
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>

      {/* L5 — mobile menu sheet. Slide-in from the right with a backdrop
          overlay; ESC + overlay tap close it. The links pull the same
          set as the desktop nav so the two stay in sync. */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-[60] md:hidden"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/40 transition-opacity"
            tabIndex={-1}
          />
          <div className="absolute right-0 top-0 flex h-full w-[80%] max-w-[320px] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <span className="text-sm font-semibold text-gray-900">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex flex-1 flex-col px-5 py-4">
              <Link
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                How it works
              </Link>
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                Book a demo
              </a>
              <Link
                href="/sign-in"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-4 rounded-lg px-4 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                  backgroundSize: "120% 100%",
                  backgroundPosition: "center",
                }}
              >
                Try free
              </Link>
            </nav>
          </div>
        </div>
      )}

      {/* HERO */}
      <Section className="relative pb-24 pt-20">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative mx-auto max-w-[1400px] px-6 text-center">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-500">The autonomous GTM engine for founders</p></Animate>
          <Animate><h1 className="mx-auto mt-6 max-w-[800px] text-[28px] font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">Your CRM finds customers, joins your calls, and does the work for you.</h1></Animate>
          <Animate><p className="mx-auto mt-6 max-w-[600px] text-lg leading-relaxed text-gray-500">Connect your email. An AI bot joins your calls, transcribes everything, and updates your CRM. You just review and close.</p></Animate>
          <Animate>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sign-up" className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Try for free</Link>
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400">Book a demo <ArrowRight size={14} className="text-gray-400" /></a>
            </div>
          </Animate>
        </div>
      </Section>

      {/* GRADIENT SEPARATOR */}
      <div className="mx-auto max-w-[1400px] px-6"><div className="h-px" style={{ background: "linear-gradient(90deg, transparent, #17C3B2, #2C6BED, #FF7A3D, transparent)" }} /></div>

      {/* WHY ELEVAY */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="max-w-3xl">
            <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">Why Elevay</p></Animate>
            <Animate><h2 className="mt-4 text-3xl font-bold leading-snug tracking-tight text-gray-900">Traditional CRMs make you do the work.<br />Elevay does it for you.</h2></Animate>
            <Animate><p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-500">You shouldn&apos;t spend hours logging notes, updating fields, and guessing who to call next. Elevay connects to your email, joins your calls, learns your customers, finds new ones, and runs your outbound — so you can focus on closing.</p></Animate>
          </div>
        </div>
      </Section>

      {/* FOUNDATIONS */}
      <Section className="pt-24">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">Foundations</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">Everything you need to sell, in one place</h2></Animate>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Mail, title: "Auto-capture everything", body: "Emails, meetings, call transcripts — captured and linked to the right contact automatically. Your CRM is always up to date without typing a word." },
              { icon: BarChart3, title: "An AI bot joins your calls", body: "A recording bot auto-joins your Google Meet, Zoom, and Teams calls. It transcribes, extracts buying signals, and updates your deals — you just review and confirm." },
              { icon: MessageSquare, title: "Outreach that sounds like you", body: "AI writes follow-ups from real meeting notes and email threads. Not templates — personalized sequences based on what was actually discussed." },
            ].map((card) => { const Icon = card.icon; return (
              <Animate key={card.title}><div className="rounded-xl border border-gray-200 bg-white p-8 transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"><div className="mb-4 inline-flex rounded-lg border border-gray-100 bg-gray-50 p-2.5"><Icon size={20} className="text-gray-600" /></div><h3 className="text-base font-semibold text-gray-900">{card.title}</h3><p className="mt-2 text-sm leading-relaxed text-gray-500">{card.body}</p></div></Animate>
            ); })}
          </div>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works" className="pt-32">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate><p className="text-xs font-medium uppercase tracking-wider text-gray-400">How it works</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">From connect to close in 7 steps</h2></Animate>
          <div className="mt-16 space-y-0">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <Animate key={step.num}>
                  <div className={`flex items-start gap-8 py-8 ${i < steps.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, rgba(23,195,178,0.1), rgba(44,107,237,0.1))" }}>
                      <Icon size={20} style={{ color: "#2C6BED" }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold tabular-nums text-gray-300">{step.num}</span>
                        <h3 className="text-[17px] font-semibold text-gray-900">{step.title}</h3>
                      </div>
                      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-gray-500">{step.desc}</p>
                    </div>
                  </div>
                </Animate>
              );
            })}
          </div>
        </div>
      </Section>

      {/* BOOK A DEMO CTA */}
      <Section className="pt-32 text-center">
        <div className="mx-auto max-w-[1400px] px-6">
          <Animate>
            <div className="mx-auto max-w-2xl rounded-2xl p-12" style={{ background: "linear-gradient(135deg, rgba(23,195,178,0.06), rgba(44,107,237,0.06), rgba(255,122,61,0.06))", border: "1px solid rgba(44,107,237,0.12)" }}>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">See Elevay in action</h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-500">15-minute demo. We&apos;ll connect your email live and show you the full pipeline — from auto-capture to closing.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Book a demo <ArrowRight size={14} /></a>
                <Link href="/sign-up" className="text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">or try it yourself &rarr;</Link>
              </div>
            </div>
          </Animate>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="pt-32">
        <div className="mx-auto max-w-3xl px-6">
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

      {/* FINAL CTA */}
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
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">or book a demo &rarr;</a>
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

      {/* FOOTER */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-[1400px] px-6 pb-8 pt-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logo-Elevay.svg" alt="Elevay" className="h-6 w-6" />
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
                Elevay
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { label: "Product", href: "#how-it-works" },
                { label: "Book a demo", href: CALENDLY_URL, external: true },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((link) =>
                (link as any).external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-500 transition-colors hover:text-gray-700"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm text-gray-500 transition-colors hover:text-gray-700"
                  >
                    {link.label}
                  </Link>
                )
              )}
            </div>

          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            &copy; 2026 Elevay. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
