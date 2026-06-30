"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { m, useReducedMotion, useInView } from "framer-motion";
import {
  ChevronDown,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { IntegrationsStrip } from "./_components/product-mockups";
import { ProcessSteps } from "./_components/process-steps";
import { HeroDemo } from "./_components/hero-demo";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";

const CALENDLY_URL = "https://calendly.com/contact-elevay/30min";

/* =================================================================
   ANIMATION HELPERS
   ================================================================= */

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Scroll-triggered section reveal, made strand-proof. The naive version
 * (whileInView alone) can leave whole sections at opacity:0 when the
 * observer misfires (fast scroll, restored scroll position, anchor jump,
 * odd intersection semantics), which historically broke this page. Three
 * belts against that:
 *   1. on mount, anything already at/above the viewport reveals instantly
 *      (covers #anchor jumps and restored scroll positions),
 *   2. the IntersectionObserver (`useInView`, once) reveals on approach,
 *   3. a hard timeout forces visibility a few seconds in, no matter what.
 * Below-the-fold sections therefore really animate when you reach them —
 * on every visit — and can never stay invisible.
 */
function useReveal(margin: "-80px 0px" | "-40px 0px" = "-80px 0px") {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView || reduced) setLive(true); }, [inView, reduced]);
  useEffect(() => {
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < window.innerHeight * 0.92) setLive(true);
    const t = setTimeout(() => setLive(true), 4500);
    return () => clearTimeout(t);
  }, []);
  return { ref, live, reduced: !!reduced };
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, live, reduced } = useReveal();
  return (
    <m.section
      ref={ref as React.Ref<HTMLElement>}
      id={id}
      className={className}
      initial={reduced ? "visible" : "hidden"}
      animate={live ? "visible" : "hidden"}
      variants={{
        visible: { transition: { staggerChildren: reduced ? 0 : 0.07 } },
      }}
    >
      {children}
    </m.section>
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
    <m.div
      className={className}
      variants={fadeInUp}
      transition={{ duration: reduced ? 0 : 0.45, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}

/** Counts up when it scrolls into view (rAF, eased) — used for the hard
 * numbers so they land instead of sitting there. */
function AnimatedStat({ to, suffix = "", className = "", style }: { to: number; suffix?: string; className?: string; style?: React.CSSProperties }) {
  const { ref, live, reduced } = useReveal("-40px 0px");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!live) return;
    if (reduced) { setN(to); return; }
    let raf = 0; const t0 = performance.now(); const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, reduced, to]);
  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={className} style={style}>
      {n}{suffix}
    </span>
  );
}

/* =================================================================
   FAQ DATA
   ================================================================= */

const faqs = [
  {
    q: "How is this different from a CRM like HubSpot or Salesforce?",
    a: "Those are databases you keep up to date by hand. We assemble and grade your market, log every email and call automatically, surface who's ready, and write the outreach. All of it in the background, so you spend your time with customers.",
  },
  {
    q: "Isn't this just another AI SDR that spams people?",
    a: "No. We don't blast generic cold email. Every message is written from each account's real context and goes out on the guardrails you set, so your domain and your reputation stay yours.",
  },
  {
    q: "Where does the target list come from?",
    a: "Elevay searches live B2B databases, scores companies against the ICP you describe, and enriches decision-makers with verified contact details. You can refine the criteria anytime and rebuild the list.",
  },
  {
    q: "How does meeting capture work?",
    a: "When a meeting with a Google Meet, Zoom, or Teams link is on your calendar, a recorder bot joins via Recall.ai, transcribes the call, and extracts notes, action items, and buying signals. You review before any of it touches your CRM.",
  },
  {
    q: "Do I need a sales team to use it?",
    a: "No. Elevay is built for founder-led sales. It's the back office a founder doesn't have yet: prospecting, list-building, drafting, and note-taking, so one person can run a full pipeline.",
  },
  {
    q: "How do I get started, and is my data secure?",
    a: "Elevay is in early access and we onboard every founder personally. Book a demo and we'll set it up on your own data and walk you through pricing together. Your data is encrypted in transit and at rest, we connect over OAuth (never your password), and you can revoke access anytime.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  // L10,stable id from the question so screen readers get a meaningful
  // aria-controls target.
  const slug = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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
        className="flex w-full cursor-pointer items-center justify-between py-5 text-left transition-colors hover:text-gray-900"
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
      {/* Real height animation (not a max-h guess): the panel glides open to
          its true size. Kept mounted so aria-controls always resolves. */}
      <m.div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ overflow: "hidden" }}
      >
        <p className="pb-5 text-[15px] leading-relaxed text-gray-600">{a}</p>
      </m.div>
    </div>
  );
}

/* =================================================================
   MAIN PAGE
   ================================================================= */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // STRUCTURAL OVERFLOW GUARD (root cause, not a patch).
  // Some environments (no GPU compositing, classic OS scrollbars, browser
  // zoom) can let a single wide descendant push a horizontal scrollbar or
  // shift the whole page right — a symptom that never reproduces in a
  // headless/overlay-scrollbar browser. Clipping the *viewport* itself
  // (the <html> scroll container) makes horizontal scroll structurally
  // impossible no matter what any child does.
  // NB: we deliberately do NOT set `scrollbar-gutter: stable`. On Windows 11
  // overlay / auto-hide scrollbars it reserves a ~17px lane on the right that
  // stays EMPTY (the overlay bar paints 0px), which reads as the whole page
  // being shifted/decalee to the right. With no gutter, content is centred in
  // the real available width whatever the scrollbar style.
  // Scoped to the marketing route: reverted on unmount, so the dashboard
  // (which legitimately scrolls wide tables) is untouched.
  useEffect(() => {
    const html = document.documentElement;
    const prevOverflowX = html.style.overflowX;
    html.style.overflowX = "clip";
    return () => {
      html.style.overflowX = prevOverflowX;
    };
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
    // overflow-x clip is a guard: even if any element ever runs wider than
    // the viewport it cannot create a horizontal scrollbar / right-side gap.
    // `clip` (not `hidden`) so the sticky nav keeps working.
    <div className="min-h-screen bg-white" style={{ overflowX: "clip" }}>
      {/* NAV: solid white. No backdrop-blur — backdrop-filter is a GPU
          compositing risk on this environment (it has smeared the page into
          a green band before). Solid bg renders identically everywhere. */}
      <nav
        aria-label="Primary"
        className={`sticky top-0 z-50 transition-shadow duration-300 ${scrolled ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "bg-white"}`}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="h-7 w-7" />
            <span className="text-xl font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#product" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Product</Link>
            <Link href="#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">How it works</Link>
            {/* Dev-only until the docs ship publicly (lib/docs/page-visibility.ts) */}
            {DOCS_PAGE_ENABLED && (
              <Link href="/docs" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Docs</Link>
            )}
          </div>
          {/* Sales-led: the only conversion CTA is a demo (no self-serve
              sign-up). Existing customers still sign in. */}
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Log in</Link>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#2C6BED" }}>Book a demo</a>
          </div>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen(true)}
            className="cursor-pointer rounded-md p-2 text-gray-700 hover:bg-gray-100 md:hidden"
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>

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
                className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex flex-1 flex-col px-5 py-4">
              {[
                { href: "#product", label: "Product" },
                { href: "#how-it-works", label: "How it works" },
                ...(DOCS_PAGE_ENABLED ? [{ href: "/docs", label: "Docs" }] : []),
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-md px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/sign-in"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                Log in
              </Link>
              {/* Demo is the only conversion path (no self-serve sign-up). */}
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-4 rounded-lg px-4 py-3 text-center text-sm font-semibold text-white"
                style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}
              >
                Book a demo
              </a>
            </nav>
          </div>
        </div>
      )}

      {/* HERO + product shot */}
      <Section className="relative overflow-hidden pb-20 pt-16 sm:pt-20">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px", maskImage: "linear-gradient(to bottom, black, transparent 75%)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)" }} />
        <div className="relative mx-auto max-w-[1240px] px-6 text-center">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">The autonomous revenue engine for founder-led sales</p></Animate>
          <Animate><h1 className="mx-auto mt-6 max-w-[900px] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-gray-900 sm:text-[48px] lg:text-[64px]">Elevay runs your pipeline.<br className="hidden sm:block" /> You run the conversations.</h1></Animate>
          <Animate><p className="mx-auto mt-6 max-w-[620px] text-lg leading-relaxed text-gray-600">We build and score your TAM, catch every buying signal in real time, and write outreach that earns the reply.</p></Animate>
          <Animate>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="cursor-pointer rounded-lg px-6 py-3 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:-translate-y-0.5 hover:opacity-90 active:translate-y-0" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Book a demo</a>
              <Link href="#how-it-works" className="group flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400">See how it works <ArrowRight size={14} className="text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
            </div>
          </Animate>
        </div>

        {/* The product shot */}
        <div id="product" className="relative mx-auto mt-14 max-w-5xl px-6">
          <Animate><HeroDemo /></Animate>
        </div>
      </Section>

      {/* INTEGRATIONS / trust strip */}
      <Section className="pb-8 pt-8">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-center text-xs font-medium uppercase tracking-wider text-gray-500">Works with the tools you already use</p></Animate>
          <Animate><div className="mt-7"><IntegrationsStrip /></div></Animate>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works" className="bg-[#F4F6FB] pt-32 pb-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">How the engine works</p></Animate>
          <Animate><h2 className="mt-4 text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">One engine, from cold list to closed deal</h2></Animate>
          {/* Market evidence — speed-to-lead. Cited third-party data
              (Dr. James Oldroyd, MIT / InsideSales), the reason the
              "prioritize" step exists: timing is most of the win. */}
          <Animate>
            <div className="relative mt-8 flex items-baseline gap-4 pl-5">
              {/* The accent rule draws itself in (scaleY, top origin) as the
                  number counts up — the stat lands instead of sitting there. */}
              <m.span
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-[2px] rounded-full"
                style={{ background: "#2C6BED", transformOrigin: "top" }}
                variants={{ hidden: { scaleY: 0 }, visible: { scaleY: 1 } }}
                transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
              />
              <span className="shrink-0 text-4xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-[44px]"><AnimatedStat to={21} suffix="×" /></span>
              <p className="max-w-md text-[15px] leading-relaxed text-gray-600">more likely to qualify a lead you reach within five minutes than one you reach at thirty <span className="text-gray-600">(MIT / InsideSales)</span>. Elevay surfaces who&apos;s ready now, so you reach them in the window that still converts.</p>
            </div>
          </Animate>
          <Animate><div className="mt-14"><ProcessSteps /></div></Animate>
        </div>
      </Section>

      {/* FROM THE FOUNDER — honest trust to stand in for the customer proof
          a pre-revenue product can't show yet: the mission in the founder's
          own words, plus a real early-access commitment. No fabricated
          metrics or customers. TODO(martin): confirm this copy is true to you. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 md:p-12">
            <Animate>
              <blockquote className="text-[22px] font-medium leading-[1.45] tracking-tight text-gray-900 md:text-[26px]">
In founder-led sales, you are the pipeline, and the work around the conversations quietly eats your week. We built Elevay to run all of it, so the only thing left to you is the conversation.
              </blockquote>
            </Animate>
            <Animate>
              <div className="mt-7 flex items-center gap-3">
                <img src="/martin_paviot.jpg" alt="Martin Paviot" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" style={{ boxShadow: "0 1px 3px rgba(26,26,46,0.18)" }} />
                <div>
                  <div className="text-sm font-semibold text-gray-900">Martin Paviot</div>
                  <div className="text-xs text-gray-500">Founder, Elevay</div>
                </div>
              </div>
            </Animate>
          </div>
        </div>
      </Section>

      {/* FAQ — objections cleared right before the closing CTA below. Centered
          header keeps the whole bottom third on one axis (founder card -> FAQ
          -> CTA) so the page reads as a single flow, not stacked islands. Each
          row settles in on a small stagger, then expands with a real height
          animation when opened. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-3xl px-6">
          <Animate><p className="text-center text-xs font-semibold uppercase tracking-wider text-[#2563DF]">Before you book</p></Animate>
          <Animate><h2 className="mt-4 text-center text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">Questions</h2></Animate>
          <m.div className="mt-10" variants={{ visible: { transition: { staggerChildren: 0.05 } } }}>
            {faqs.map((faq) => (
              <Animate key={faq.q}>
                <FAQItem q={faq.q} a={faq.a} />
              </Animate>
            ))}
          </m.div>
        </div>
      </Section>

      {/* BOOK A DEMO — the closing CTA, last thing before the footer so the ask
          lands after the FAQ has cleared objections. */}
      <Section className="pt-32 pb-32 text-center">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate>
            <div className="mx-auto max-w-2xl rounded-2xl p-12" style={{ background: "#F6F8FC", border: "1px solid rgba(44,107,237,0.12)" }}>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">See Elevay on your own pipeline</h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] text-gray-600">15 minutes. We&apos;ll connect your inbox live, build a target list from your ICP, and show you the priorities it surfaces.</p>
              <div className="mt-8 flex justify-center">
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="group inline-flex cursor-pointer items-center gap-2 rounded-lg px-8 py-3.5 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:-translate-y-0.5 hover:opacity-90 active:translate-y-0" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Book a demo <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" /></a>
              </div>
            </div>
          </Animate>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="h-6 w-6" />
              <span className="text-base font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { label: "Product", href: "#product" },
                { label: "How it works", href: "#how-it-works" },
                ...(DOCS_PAGE_ENABLED ? [{ label: "Docs", href: "/docs" }] : []),
                { label: "Book a demo", href: CALENDLY_URL, external: true },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((link) =>
                (link as any).external ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 transition-colors hover:text-gray-700">{link.label}</a>
                ) : (
                  <Link key={link.label} href={link.href} className="text-sm text-gray-500 transition-colors hover:text-gray-700">{link.label}</Link>
                )
              )}
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-gray-500">&copy; 2026 Elevay. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
