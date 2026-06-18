"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { m, useReducedMotion, useInView } from "framer-motion";
import {
  ChevronDown,
  ArrowRight,
  Menu,
  X,
  UserCheck,
  Lock,
  Key,
  RotateCcw,
} from "lucide-react";
import { IntegrationsStrip, BuiltOnStrip, Logo, clogo } from "./_components/product-mockups";
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
    a: "Those are databases you keep up to date by hand. Elevay builds the target list, captures every email and call for you, tells you who to work next, and drafts the outreach. You approve and close; it does the data work.",
  },
  {
    q: "Isn't this just another AI SDR that spams people?",
    a: "No. Elevay doesn't fire off autonomous cold-email blasts. It drafts from real context and waits for your approval before anything goes out, so you stay in control of your domain and your reputation.",
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
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">The pre-built revenue engine for founder-led sales</p></Animate>
          <Animate><h1 className="mx-auto mt-6 max-w-[900px] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-gray-900 sm:text-[48px] lg:text-[64px]">Elevay runs your pipeline.<br className="hidden sm:block" /> You run the conversations.</h1></Animate>
          <Animate><p className="mx-auto mt-6 max-w-[620px] text-lg leading-relaxed text-gray-600">It builds your target list, tells you who to reach and when, drafts your outreach across email and calls, and captures every meeting in your CRM. You review and close.</p></Animate>
          <Animate>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="cursor-pointer rounded-lg px-6 py-3 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:-translate-y-0.5 hover:opacity-90 active:translate-y-0" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Book a demo</a>
              <Link href="#how-it-works" className="group flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400">See how it works <ArrowRight size={14} className="text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
            </div>
          </Animate>
          <Animate><p className="mt-4 text-xs text-gray-500">A live 15-minute demo on your own data · We onboard every founder personally</p></Animate>
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
          {/* Trust / control band — honest anxiety-reducers (MECLABS A).
              Every claim is true today: see the FAQ (encryption, OAuth,
              revoke) and the human-in-the-loop principle. Each chip settles
              in on its own small stagger (opacity + y, GPU-safe). */}
          <m.div
            className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {[
              { icon: Lock, t: "Encrypted in transit and at rest" },
              { icon: Key, t: "OAuth login, never your password" },
              { icon: RotateCcw, t: "Revoke access anytime" },
              { icon: UserCheck, t: "Nothing sends without you" },
            ].map((c) => { const Icon = c.icon; return (
              <m.span
                key={c.t}
                variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
                className="inline-flex items-center gap-1.5 text-[12px] text-gray-500"
              >
                <Icon size={13} className="text-gray-400" /> {c.t}
              </m.span>
            ); })}
          </m.div>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works" className="bg-[#F4F6FB] pt-32 pb-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">How it works</p></Animate>
          <Animate><h2 className="mt-4 text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">From a cold list to a closed deal</h2></Animate>
          <Animate><p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">Watch one account, Notion, travel from a cold list to a closed deal. Each step moves the same deal one stage forward, because Elevay remembers every interaction.</p></Animate>
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

      {/* HUMAN IN THE LOOP — the control principle. Its "nothing sends
          without you" proof now lives, animated, in the steps above
          (Approve & send, Review & confirm), so this stays a clean
          statement of the principle, not a duplicate static mock. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-10 md:p-14">
            <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">Human in the loop</p></Animate>
            <Animate><h2 className="mt-3 max-w-2xl text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">It does the work. You make the calls.</h2></Animate>
            <Animate><p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">Every email, meeting, and deal change waits for your go-ahead. Elevay does the research, the list-building, the first drafts, and the note-taking, the work that doesn&apos;t need a person. The conversations and the relationships stay yours.</p></Animate>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                { h: "Elevay handles", b: "Prospecting, enrichment, scoring, drafting, transcription, and follow-up reminders, run continuously in the background." },
                { h: "You handle", b: "The pitch, the read on the room, and the close, the part of selling that needs a person." },
                { h: "Autonomy you control", b: "Approve more and it does more. Pull it back to drafts-only anytime. It earns scope, it never assumes it." },
              ].map((col) => (
                <Animate key={col.h}>
                  <div className="border-l-2 pl-4" style={{ borderColor: "rgba(44,107,237,0.22)" }}>
                    <h3 className="text-sm font-semibold text-gray-900">{col.h}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{col.b}</p>
                  </div>
                </Animate>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* FROM THE FOUNDER — honest trust to stand in for the customer proof
          a pre-revenue product can't show yet: the mission in the founder's
          own words, plus a real early-access commitment. No fabricated
          metrics or customers. TODO(martin): confirm this copy is true to you. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 md:p-12">
            <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">From the founder</p></Animate>
            <Animate>
              <blockquote className="mt-5 text-[19px] leading-relaxed text-gray-800 md:text-[21px] md:leading-[1.65]">
                In founder-led sales, you are the pipeline. The conversations are yours to win, but everything around them, the lists, the data, the first drafts, the call notes, quietly eats your week. Salesforce puts it at <span className="font-semibold text-gray-900">70% of a rep&apos;s time</span> on admin and data entry, not selling. I&apos;m building Elevay to be the back office a founder doesn&apos;t have yet: it does that work and hands you the conversations. It&apos;s early, and I onboard every founder myself, so when you start, you&apos;re talking to me.
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
            <Animate>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 pt-6 text-[13px] text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  {/* A live-status breath (opacity only, honors reduced motion) */}
                  <span className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse" style={{ background: "#10B981" }} />
                  In early access, onboarding founders one at a time
                </span>
                <span className="inline-flex items-center gap-1.5"><UserCheck size={14} className="text-gray-400" /> You talk to the founder, not a sales team</span>
              </div>
            </Animate>
          </div>
        </div>
      </Section>

      {/* LANDSCAPE: positioning vs the alternatives (after the product
          story, before the conversion CTAs) */}
      <Section className="bg-[#F4F6FB] pt-32 pb-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">Landscape</p></Animate>
          <Animate><h2 className="mt-4 text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">The alternatives weren&apos;t built for founder-led sales</h2></Animate>
          <Animate><p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">Each category solves one slice and leaves you holding the rest. Elevay is built to not be any of them.</p></Animate>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { logos: ["salesforce.com", "hubspot.com", "attio.com"], kind: "Legacy CRMs", headline: "You maintain them.", body: "Per-seat pricing, manual data entry, dashboards that go stale the moment you stop typing. They store what you sell; they don't help you sell it." },
              { logos: ["11x.ai", "artisan.co", "aisdr.com"], kind: "AI SDRs", headline: "They act without you.", body: "Autonomous senders that blast generic messages under your name. The output is forgettable; the cost lands on your domain and your reputation." },
              { logos: ["apollo.io", "instantly.ai", "clay.com"], kind: "Tool stacks", headline: "Five tools, no memory.", body: "Prospecting here, sequences there, enrichment elsewhere. Each tool forgets what the others did, and you become the integration between them." },
            ].map((card) => (
              <Animate key={card.kind} className="h-full">
                {/* Hover lift is a transform (translateY) — composited, cheap,
                    and it stays inside normal flow. */}
                <m.div
                  whileHover={{ y: -5 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-8 transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
                >
                  <div className="mb-4 flex items-center gap-1.5">
                    {card.logos.map((d) => <Logo key={d} src={clogo(d)} size={28} rounded="rounded-lg" />)}
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{card.kind}</p>
                  <h3 className="mt-2 text-base font-semibold text-gray-900">{card.headline}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{card.body}</p>
                </m.div>
              </Animate>
            ))}
          </div>
          <Animate>
            <p className="mt-12 max-w-2xl text-base leading-relaxed text-gray-700">
              <span className="font-semibold text-gray-900">Elevay is the fourth option:</span> one system that builds the list, works the signals, drafts the outreach, and remembers every conversation, and never acts without you.
            </p>
          </Animate>
        </div>
      </Section>

      {/* BOOK A DEMO CTA */}
      <Section className="pt-32 text-center">
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

      {/* FAQ — each row settles in on its own small stagger, then expands
          with a real height animation when opened. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-3xl px-6">
          <Animate><h2 className="text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">Questions</h2></Animate>
          <m.div className="mt-8" variants={{ visible: { transition: { staggerChildren: 0.05 } } }}>
            {faqs.map((faq) => (
              <Animate key={faq.q}>
                <FAQItem q={faq.q} a={faq.a} />
              </Animate>
            ))}
          </m.div>
        </div>
      </Section>

      {/* BUILT ON — honest borrowed credibility. Every vendor named is
          really wired in (see package.json / RECALL_API_KEY). The value
          is a reliability signal: specialists, not homegrown shortcuts. */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 px-8 py-11 text-center md:px-12">
            <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">Under the hood</p></Animate>
            <Animate><h2 className="mx-auto mt-3 max-w-xl text-2xl font-bold tracking-tight text-gray-900">The infrastructure Elevay is built on</h2></Animate>
            <Animate><p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-gray-600">We don&apos;t reinvent the hard parts. Reasoning, drafting, voice, transcription, and meeting capture run on specialized providers built for exactly that.</p></Animate>
            <Animate><div className="mt-9"><BuiltOnStrip /></div></Animate>
          </div>
        </div>
      </Section>

      {/* FINAL CTA */}
      <Section className="mt-32">
        <div className="py-24" style={{ background: "linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%)" }}>
          <div className="mx-auto max-w-[1240px] px-6 text-center">
            <Animate><h2 className="text-[30px] font-bold tracking-tight text-gray-900 sm:text-[38px]">Run your whole pipeline<br />from one place.</h2></Animate>
            <Animate><p className="mt-4 text-lg text-gray-600">See it on your own pipeline, live, in 15 minutes.</p></Animate>
            <Animate>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="inline-block cursor-pointer rounded-lg px-8 py-4 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:-translate-y-0.5 hover:opacity-90 active:translate-y-0" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Book a demo</a>
                <Link href="#how-it-works" className="cursor-pointer text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">see how it works &rarr;</Link>
              </div>
            </Animate>
            <Animate><p className="mt-4 text-xs text-gray-500">We onboard every founder personally · Your data stays yours</p></Animate>
          </div>
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
