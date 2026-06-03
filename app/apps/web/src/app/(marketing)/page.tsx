"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Inbox,
  Send,
  ArrowRight,
  Menu,
  X,
  Database,
  Megaphone,
  Layers,
  UserCheck,
  MessageSquare,
  BarChart3,
  Target,
} from "lucide-react";
import {
  DashboardMock,
  IntegrationsStrip,
} from "./_components/product-mockups";
import { ProcessTour } from "./_components/process-tour";

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
  // Reveal on MOUNT, not on scroll. A scroll-gated reveal (useInView)
  // can strand whole sections at opacity:0 when the observer never
  // fires: full-page render, fast scroll, a restored scroll position,
  // or a browser that evaluates intersection differently. That reads as
  // a "broken / totally shifted" page with big blank gaps. Mount-based
  // reveal can never leave content invisible; below-the-fold sections
  // simply finish their fade off-screen and are just *there* when you
  // reach them. (Also matches the skill's "don't animate everything".)
  const reduced = useReducedMotion();

  return (
    <motion.section
      id={id}
      className={className}
      initial={reduced ? "visible" : "hidden"}
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: reduced ? 0 : 0.06 } },
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
    q: "What does it cost, and is my data secure?",
    a: "Start with a 14-day free trial on your own data, no credit card. Paid plans scale with your volume. Your data is encrypted in transit and at rest, we connect over OAuth (never your password), and you can revoke access anytime.",
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
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-[15px] leading-relaxed text-gray-600">{a}</p>
      </div>
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
      {/* NAV: floating glass per ui-ux-pro-max (top spacing, backdrop blur). */}
      <nav
        aria-label="Primary"
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/85 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md" : "bg-white/60 backdrop-blur-sm"}`}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-Elevay.svg" alt="Elevay" className="h-7 w-7" />
            <span className="text-xl font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#product" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Product</Link>
            <Link href="#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">How it works</Link>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Book a demo</a>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Log in</Link>
            <Link href="/sign-up" className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#2C6BED" }}>Try free</Link>
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
                className="mt-4 rounded-lg px-4 py-3 text-center text-sm font-semibold text-white"
                style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}
              >
                Try free
              </Link>
            </nav>
          </div>
        </div>
      )}

      {/* HERO + product shot */}
      <Section className="relative overflow-hidden pb-20 pt-16 sm:pt-20">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px", maskImage: "linear-gradient(to bottom, black, transparent 75%)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)" }} />
        <div className="relative mx-auto max-w-[1240px] px-6 text-center">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">The pre-built revenue engine for founder-led sales</p></Animate>
          <Animate><h1 className="mx-auto mt-6 max-w-[800px] text-[32px] font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-[56px]">Elevay runs your pipeline.<br className="hidden sm:block" /> You run the conversations.</h1></Animate>
          <Animate><p className="mx-auto mt-6 max-w-[620px] text-lg leading-relaxed text-gray-600">It builds your target list, tells you who to reach and when, drafts your outreach across email and calls, and captures every meeting in your CRM. You review and close.</p></Animate>
          <Animate>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sign-up" className="cursor-pointer rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Try for free</Link>
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400">Book a demo <ArrowRight size={14} className="text-gray-400" /></a>
            </div>
          </Animate>
          <Animate><p className="mt-4 text-xs text-gray-500">14-day free trial on your own data. No credit card.</p></Animate>
        </div>

        {/* The product shot */}
        <div id="product" className="relative mx-auto mt-14 max-w-5xl px-6">
          <Animate><DashboardMock /></Animate>
        </div>
      </Section>

      {/* INTEGRATIONS / trust strip */}
      <Section className="pb-8 pt-8">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-center text-xs font-medium uppercase tracking-wider text-gray-400">Works with the tools you already use</p></Animate>
          <Animate><div className="mt-7"><IntegrationsStrip /></div></Animate>
        </div>
      </Section>

      {/* WHY ELEVAY + comparison table */}
      <Section className="pt-28">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="max-w-3xl">
            <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2C6BED]">Why Elevay</p></Animate>
            <Animate><h2 className="mt-4 text-3xl font-bold leading-snug tracking-tight text-gray-900 sm:text-[34px]">In founder-led sales, you are the sales team.<br />Elevay is the team behind you.</h2></Animate>
            <Animate><p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">Prospecting, list-building, data entry, first drafts, call notes: the work a sales org does in the background, you do at night. Elevay takes that off your plate so your hours go to the conversations that actually close deals.</p></Animate>
          </div>

          <Animate>
            <div className="mt-12 overflow-hidden rounded-xl border border-gray-200">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-0 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <div className="px-5 py-3">The work</div>
                <div className="border-l border-gray-200 px-5 py-3">On your own</div>
                <div className="border-l border-gray-200 px-5 py-3 text-gray-900" style={{ background: "rgba(44,107,237,0.06)" }}>With Elevay</div>
              </div>
              {[
                { task: "Build a target list", old: "Import CSV, enrich, score by hand", elevay: "Auto-built from your ICP" },
                { task: "Decide who to work today", old: "Guess, or work top-down", elevay: "Ranked by live signals" },
                { task: "Write the outreach", old: "Template, then edit each one", elevay: "Drafted from real context" },
                { task: "Log meeting notes", old: "15 min per call, from memory", elevay: "Recorded, transcribed, structured" },
                { task: "Find what a buyer said", old: "Search your inbox", elevay: "Ask in chat, with citations" },
              ].map((row, i, arr) => (
                <div key={row.task} className={`grid grid-cols-[1.2fr_1fr_1fr] gap-0 text-[14px] ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <div className="px-5 py-4 font-medium text-gray-900">{row.task}</div>
                  <div className="border-l border-gray-200 px-5 py-4 text-gray-500">{row.old}</div>
                  <div className="border-l border-gray-200 px-5 py-4 text-gray-900">{row.elevay}</div>
                </div>
              ))}
            </div>
          </Animate>
        </div>
      </Section>

      {/* CAPABILITIES: compact bento. The deep, animated visuals live in
          the process tour below, so this stays a tight checklist. */}
      <Section className="pt-28">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2C6BED]">What it does</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">A whole sales operation, in one place</h2></Animate>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Target, title: "Auto-built TAM", body: "A scored target list from your ICP, with verified decision-makers." },
              { icon: BarChart3, title: "Signal-based priorities", body: "Who to work next, ranked by intent, replies, and deal risk." },
              { icon: Send, title: "Outreach, email and calls", body: "Sequences and a cold-call cockpit, drafted from real context." },
              { icon: Inbox, title: "Every meeting captured", body: "Calls transcribed; action items and buying signals extracted." },
              { icon: MessageSquare, title: "Ask your pipeline", body: "Plain-language answers, each cited to the email or transcript." },
              { icon: Database, title: "A CRM that fills itself", body: "Accounts, contacts, and deals stay current without data entry." },
            ].map((c) => { const Icon = c.icon; return (
              <Animate key={c.title}>
                <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
                  <div className="mb-3 inline-flex w-fit rounded-lg p-2" style={{ background: "rgba(44,107,237,0.08)" }}><Icon size={17} style={{ color: "#2C6BED" }} /></div>
                  <h3 className="text-[15px] font-semibold text-gray-900">{c.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-600">{c.body}</p>
                </div>
              </Animate>
            ); })}
          </div>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works" className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2C6BED]">How it works</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">From a cold list to a closed deal</h2></Animate>
          <Animate><p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">The five moves Elevay runs for you. Click any step, or watch it play.</p></Animate>
          <Animate><div className="mt-12"><ProcessTour /></div></Animate>
        </div>
      </Section>

      {/* HUMAN IN THE LOOP */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-10 md:p-14">
            <Animate>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-2.5">
                <UserCheck size={20} style={{ color: "#2C6BED" }} />
              </div>
            </Animate>
            <Animate><p className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-400">Human in the loop</p></Animate>
            <Animate><h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-gray-900">It does the work. You make the calls.</h2></Animate>
            <Animate><p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">Elevay never sends an email, books a meeting, or changes a deal without you. It handles the research, the list-building, the first drafts, and the note-taking: the work that doesn&apos;t need a person. The conversations and the relationships stay yours.</p></Animate>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                { title: "Elevay handles", body: "Prospecting, enrichment, scoring, drafting, transcription, and follow-up reminders, the repeatable work, done continuously." },
                { title: "You handle", body: "The conversations, the pitch, the read on the room, and the close: the part of selling that needs a human." },
                { title: "Autonomy you control", body: "Approve more and Elevay does more. Pull it back to drafts-only anytime. It earns scope, it never assumes it." },
              ].map((col) => (
                <Animate key={col.title}>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{col.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{col.body}</p>
                  </div>
                </Animate>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* LANDSCAPE: positioning vs the alternatives (after the product
          story, before the conversion CTAs) */}
      <Section className="pt-32">
        <div className="mx-auto max-w-[1240px] px-6">
          <Animate><p className="text-xs font-semibold uppercase tracking-wider text-[#2C6BED]">Landscape</p></Animate>
          <Animate><h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">The alternatives weren&apos;t built for founder-led sales</h2></Animate>
          <Animate><p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">Each category solves one slice and leaves you holding the rest. Elevay is built to not be any of them.</p></Animate>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Database, kind: "Legacy CRMs", examples: "Salesforce, HubSpot, Attio", headline: "You maintain them.", body: "Per-seat pricing, manual data entry, dashboards that go stale the moment you stop typing. They store what you sell; they don't help you sell it." },
              { icon: Megaphone, kind: "AI SDRs", examples: "11x, Artisan, AiSDR", headline: "They act without you.", body: "Autonomous senders that blast generic messages under your name. The output is forgettable; the cost lands on your domain and your reputation." },
              { icon: Layers, kind: "Tool stacks", examples: "Apollo + Instantly + Clay + a CRM", headline: "Five tools, no memory.", body: "Prospecting here, sequences there, enrichment elsewhere. Each tool forgets what the others did, and you become the integration between them." },
            ].map((card) => { const Icon = card.icon; return (
              <Animate key={card.kind}>
                <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-8 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
                  <div className="mb-4 inline-flex w-fit rounded-lg border border-gray-100 bg-gray-50 p-2.5"><Icon size={20} className="text-gray-600" /></div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{card.kind}</p>
                  <p className="mt-1 text-xs text-gray-500">{card.examples}</p>
                  <h3 className="mt-4 text-base font-semibold text-gray-900">{card.headline}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{card.body}</p>
                </div>
              </Animate>
            ); })}
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
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#2C6BED" }}>Book a demo <ArrowRight size={14} /></a>
                <Link href="/sign-up" className="cursor-pointer text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">or try it yourself &rarr;</Link>
              </div>
            </div>
          </Animate>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="pt-32">
        <div className="mx-auto max-w-3xl px-6">
          <Animate><h2 className="text-3xl font-bold tracking-tight text-gray-900">Questions</h2></Animate>
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
        <div className="py-24" style={{ background: "linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%)" }}>
          <div className="mx-auto max-w-[1240px] px-6 text-center">
            <Animate><h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Run your whole pipeline<br />from one place.</h2></Animate>
            <Animate><p className="mt-4 text-lg text-gray-600">Free to start. Connected in 3 minutes.</p></Animate>
            <Animate>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link href="/sign-up" className="inline-block cursor-pointer rounded-lg px-8 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", backgroundPosition: "center" }}>Get started free</Link>
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">or book a demo &rarr;</a>
              </div>
            </Animate>
            <Animate><p className="mt-4 text-xs text-gray-500">No credit card required</p></Animate>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logo-Elevay.svg" alt="Elevay" className="h-6 w-6" />
              <span className="text-base font-bold" style={{ background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)", backgroundSize: "120% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { label: "Product", href: "#product" },
                { label: "How it works", href: "#how-it-works" },
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
          <p className="mt-8 text-center text-xs text-gray-400">&copy; 2026 Elevay. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
