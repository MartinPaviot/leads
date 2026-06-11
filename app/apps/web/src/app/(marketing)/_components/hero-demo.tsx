"use client";

/**
 * HeroDemo — the animated, self-playing product demo in the hero.
 *
 * Each phase faithfully reproduces a real Elevay page (matching the
 * actual PageHeader + FilterBar + content from the app code), inside a
 * persistent shell (real sidebar + Ask-Elevay chat bar):
 *
 *   1. Accounts   — the TAM table: status dots flip to green, scores land
 *   2. Up next    — the priorities feed; a live signal slides in
 *   3. Campaigns  — a sequence; the email types itself, then sends
 *   4. Meetings   — a call is captured: transcript + action items appear
 *   5. Ask Elevay — a question types into the bar; the answer streams
 *
 * Auto-advances (per-phase timing), pauses on hover, runs only in view,
 * static under prefers-reduced-motion. The sidebar's active item follows.
 */

import { useState, useEffect, useRef, type ReactElement } from "react";
import { motion, AnimatePresence, LayoutGroup, useReducedMotion, useInView, type Variants } from "framer-motion";
import {
  Building2, Users, CircleDot, Inbox, Phone, Clock, BookOpen, Wand2, Zap,
  Calendar, FileText, CheckSquare, BarChart3, Send, Compass, Bell, Reply,
  Check, Search, Sparkles, Target, Plus, Gauge, Radio, Mic,
  TrendingUp, RefreshCw, DollarSign, AlertTriangle, type LucideIcon,
} from "lucide-react";
import { AppFrame, Avatar, Logo, ScaleToFit, clogo } from "./product-mockups";

const BRAND = "linear-gradient(90deg,#17C3B2,#2C6BED,#FF7A3D)";
const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const C = { green: "#4E9E86", greenSoft: "rgba(78,158,134,0.13)", red: "#D17B76", redSoft: "rgba(209,123,118,0.13)", amber: "#CDA25C", amberSoft: "rgba(205,162,92,0.15)", blue: "#2C6BED", blueSoft: "rgba(44,107,237,0.10)" };
// Hero TEASER: just three phases that show the agent actually working
// (build the list -> send for you -> the CRM updates itself). The full
// six-surface walkthrough lives in the how-it-works step sequence below,
// so the hero no longer duplicates it. Accounts, Campaigns, Opportunities.
const PHASE_MS = [6000, 5800, 5600];

/* ── helpers ─────────────────────────────────────────────────────── */

function CountUp({ to, start, duration = 1300 }: { to: number; start: boolean; duration?: number }) {
  const [n, setN] = useState(start ? 0 : to);
  useEffect(() => {
    if (!start) { setN(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / duration); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, duration]);
  return <>{n.toLocaleString()}</>;
}

function Typewriter({ text, start, speed = 24, delay = 0, caret = false }: { text: string; start: boolean; speed?: number; delay?: number; caret?: boolean }) {
  const [count, setCount] = useState(start ? 0 : text.length);
  useEffect(() => {
    if (!start) { setCount(text.length); return; }
    setCount(0);
    let id: ReturnType<typeof setInterval> | undefined;
    const begin = setTimeout(() => { let i = 0; id = setInterval(() => { i += 1; setCount(i); if (i >= text.length && id) clearInterval(id); }, speed); }, delay);
    return () => { clearTimeout(begin); if (id) clearInterval(id); };
  }, [text, start, speed, delay]);
  return <span>{text.slice(0, count)}{caret && count < text.length && <span className="ml-[1px] inline-block h-[1em] w-[1.5px] translate-y-[2px] animate-pulse" style={{ background: T.accent }} />}</span>;
}

function ScorePill({ score }: { score: number }) {
  const t = score >= 90 ? { c: C.green, b: C.greenSoft } : score >= 80 ? { c: C.blue, b: C.blueSoft } : { c: C.amber, b: C.amberSoft };
  return <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums" style={{ color: t.c, background: t.b }}>{score}</span>;
}

/* PageHeader — mirrors components/ui/page-header.tsx */
function PageHeaderBar({ icon: Icon, title, count, children }: { icon: LucideIcon; title: string; count?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b px-4" style={{ borderColor: T.border, background: T.card }}>
      <Icon size={15} style={{ color: T.ter }} />
      <span className="text-[13px] font-semibold" style={{ color: T.text }}>{title}</span>
      {count != null && <span className="text-[11.5px]" style={{ color: T.ter }}>{count}</span>}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function HBtn({ icon: Icon, children, gradient, act }: { icon?: LucideIcon; children: React.ReactNode; gradient?: boolean; act?: string }) {
  return (
    <span data-action={act} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium"
      style={gradient ? { background: BRAND, color: "#fff" } : { border: `1px solid ${T.border}`, color: T.sec }}>
      {Icon && <Icon size={11} />}{children}
    </span>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[36px] shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: T.border, background: T.card }}>{children}</div>;
}

const listV = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } };
// Items don't just fade — they spring into place, so each one reads as having
// "landed" rather than appeared. (opacity + y only; safe on table rows.)
const itemV: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 340, damping: 26, mass: 0.7 } } };
// A card/panel that pops in with a touch of scale — used for the moments that
// should feel like the agent just produced something (extractions, answers).
const popV: Variants = { hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 22 } } };

/* ── sidebar (mirrors the real app) ─────────────────────────────── */

const navSections: { label?: string; items: { icon: LucideIcon; label: string }[] }[] = [
  { items: [{ icon: Clock, label: "Up next" }] },
  { label: "AI", items: [{ icon: BookOpen, label: "Knowledge" }, { icon: Wand2, label: "Skills" }] },
  { label: "CRM", items: [{ icon: Building2, label: "Accounts" }, { icon: Users, label: "Contacts" }, { icon: CircleDot, label: "Opportunities" }] },
  { label: "Engage", items: [{ icon: Inbox, label: "Inbox" }, { icon: Phone, label: "Call Mode" }, { icon: Zap, label: "Campaigns" }] },
  { label: "Activity", items: [{ icon: Calendar, label: "Meetings" }, { icon: FileText, label: "Notes" }, { icon: CheckSquare, label: "Tasks" }, { icon: BarChart3, label: "Insights" }] },
];

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="hidden w-[160px] shrink-0 flex-col border-r sm:flex" style={{ borderColor: T.soft, background: T.card }}>
      <div className="flex h-[42px] shrink-0 items-center gap-1.5 border-b px-3" style={{ borderColor: T.soft }}>
        <img src="/logo-Elevay.svg?v=2" alt="" className="h-5 w-5" />
        <span className="text-[13px] font-bold" style={{ background: BRAND, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1.5">
        {navSections.map((s, si) => (
          <div key={s.label || si} className={si > 0 ? "mt-1.5" : ""}>
            {s.label && <div className="mb-0.5 px-2 text-[8.5px] font-semibold uppercase tracking-wider" style={{ color: "#B4B8C4" }}>{s.label}</div>}
            <div className="space-y-px">
              {s.items.map((n) => { const Icon = n.icon; const on = n.label === active; return (
                <div key={n.label} data-nav={n.label} className="flex h-[20px] items-center gap-2 rounded-md px-2 text-[10.5px] font-medium transition-colors" style={{ color: on ? T.text : T.sec, background: on ? T.accentSoft : "transparent", boxShadow: on ? `inset 2px 0 0 0 ${T.accent}` : undefined }}>
                  <Icon size={12} style={{ color: on ? T.accent : T.ter }} />{n.label}
                </div>
              ); })}
            </div>
          </div>
        ))}
      </div>
      {/* Footer height is locked to the chat bar's (BAR_H) so their top
          borders form one continuous line across the shell. */}
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-t px-3" style={{ borderColor: T.soft }}>
        <Avatar name="Martin Paviot" size={20} /><span className="text-[11px] font-medium" style={{ color: T.text }}>Martin</span>
      </div>
    </aside>
  );
}

/* ── phase 1 · Accounts (TAM table) ─────────────────────────────── */

function AccountsPhase({ reduced }: { reduced: boolean }) {
  const [built, setBuilt] = useState(reduced);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (reduced) return; const t = setTimeout(() => setBuilt(true), 2600); return () => clearTimeout(t); }, [reduced]);
  // Once built, the TAM scrolls itself — the full list glides past so you see
  // its breadth, not a static top. This is the one auto-scrolling list; every
  // other phase fits its frame without scroll.
  useEffect(() => {
    if (reduced || !built) return;
    const sc = listRef.current;
    if (!sc) return;
    let raf = 0, cancelled = false, dir = 1, last = performance.now();
    const SPEED = 40; // px/sec — a gentle, continuous crawl
    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const max = sc.scrollHeight - sc.clientHeight;
      if (max > 4) {
        let next = sc.scrollTop + dir * SPEED * dt;
        if (next >= max) { next = max; dir = -1; }
        else if (next <= 0) { next = 0; dir = 1; }
        sc.scrollTop = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [reduced, built]);
  const rows = [
    { dom: "linear.app", n: "Linear", ind: "Dev tools", size: "180", s: 94, sig: ["Hiring", "YC"] },
    { dom: "notion.so", n: "Notion", ind: "Productivity", size: "600", s: 89, sig: ["Funding"] },
    { dom: "figma.com", n: "Figma", ind: "Design", size: "1200", s: 92, sig: ["Expanding"] },
    { dom: "webflow.com", n: "Webflow", ind: "MarTech", size: "240", s: 85, sig: ["Hiring"] },
    { dom: "vercel.com", n: "Vercel", ind: "Dev tools", size: "550", s: 88, sig: ["Funding", "Hiring"] },
    { dom: "airtable.com", n: "Airtable", ind: "No-code", size: "140", s: 78, sig: ["Investor"] },
    { dom: "supabase.com", n: "Supabase", ind: "Database", size: "120", s: 90, sig: ["YC", "Hiring"] },
    { dom: "ramp.com", n: "Ramp", ind: "Fintech", size: "730", s: 86, sig: ["Expanding"] },
    { dom: "retool.com", n: "Retool", ind: "Dev tools", size: "280", s: 81, sig: ["Funding"] },
    { dom: "posthog.com", n: "PostHog", ind: "Analytics", size: "90", s: 79, sig: ["Open source"] },
    { dom: "loom.com", n: "Loom", ind: "Video", size: "320", s: 76, sig: ["Hiring"] },
    { dom: "intercom.com", n: "Intercom", ind: "Support", size: "950", s: 83, sig: ["Enterprise"] },
    { dom: "mixpanel.com", n: "Mixpanel", ind: "Analytics", size: "330", s: 80, sig: ["Hiring"] },
    { dom: "segment.com", n: "Segment", ind: "Data", size: "420", s: 84, sig: ["Expanding"] },
    { dom: "amplitude.com", n: "Amplitude", ind: "Analytics", size: "680", s: 82, sig: ["Public"] },
    { dom: "datadoghq.com", n: "Datadog", ind: "Observability", size: "5000", s: 87, sig: ["Enterprise"] },
    { dom: "snowflake.com", n: "Snowflake", ind: "Data cloud", size: "7000", s: 75, sig: ["Enterprise"] },
    { dom: "stripe.com", n: "Stripe", ind: "Fintech", size: "8000", s: 91, sig: ["Expanding"] },
    { dom: "plaid.com", n: "Plaid", ind: "Fintech", size: "1200", s: 85, sig: ["Funding"] },
    { dom: "brex.com", n: "Brex", ind: "Fintech", size: "1100", s: 83, sig: ["Hiring"] },
    { dom: "mercury.com", n: "Mercury", ind: "Fintech", size: "700", s: 88, sig: ["Funding", "Hiring"] },
    { dom: "gusto.com", n: "Gusto", ind: "HR tech", size: "2500", s: 77, sig: ["Expanding"] },
    { dom: "rippling.com", n: "Rippling", ind: "HR tech", size: "3000", s: 86, sig: ["Funding"] },
    { dom: "deel.com", n: "Deel", ind: "HR tech", size: "4000", s: 84, sig: ["Expanding"] },
    { dom: "calendly.com", n: "Calendly", ind: "Productivity", size: "600", s: 79, sig: ["Hiring"] },
    { dom: "miro.com", n: "Miro", ind: "Collaboration", size: "1800", s: 81, sig: ["Enterprise"] },
    { dom: "asana.com", n: "Asana", ind: "PM", size: "1700", s: 76, sig: ["Public"] },
    { dom: "clickup.com", n: "ClickUp", ind: "PM", size: "1000", s: 80, sig: ["Hiring"] },
  ];
  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={Building2} title="Accounts" count={<CountUp to={544} start={!reduced} />}>
        <HBtn icon={Sparkles}>Find more</HBtn>
        <HBtn icon={Target} act="score">Score</HBtn>
        <HBtn icon={Plus} gradient>Create</HBtn>
      </PageHeaderBar>
      {/* Live build: the agent scans live databases and scores accounts
          against the ICP — a progress bar fills, the count climbs, and each
          row's status dot flips amber -> green as it's scored. */}
      <div className="flex h-[28px] shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: T.border, background: T.card }}>
        {built ? (
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium" style={{ color: C.green }}><Check size={11} /> 544 accounts scored · 320 match ICP-1</span>
        ) : (
          <>
            <motion.span className="inline-flex" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={11} style={{ color: T.accent }} /></motion.span>
            <span className="text-[10.5px] font-medium" style={{ color: T.sec }}>Scanning live B2B databases · scoring against ICP-1…</span>
            <span className="relative ml-auto h-1 w-20 overflow-hidden rounded-full" style={{ background: T.soft }}>
              <motion.span className="absolute inset-y-0 left-0 w-full rounded-full" style={{ background: T.accent, transformOrigin: "left" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 2.5, ease: "easeInOut" }} />
            </span>
          </>
        )}
      </div>
      <FilterBar>
        {["All 544", "ICP-1 320", "ICP-2 188", "Customers 44", "Manual"].map((t) => { const on = t === "ICP-1 320"; return (
          <span key={t} className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: on ? T.accentSoft : "transparent", color: on ? T.accent : T.ter }}>{t}</span>
        ); })}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px]" style={{ borderColor: T.border, color: T.ter }}><Search size={11} /> Search</span>
      </FilterBar>
      {/* Scrollable list: hover pauses the demo, so the full TAM can be
          scrolled before it advances. */}
      <div className="relative min-h-0 flex-1">
        <div ref={listRef} className="h-full overflow-y-auto px-3 pt-2">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: T.ter }}>
              {[{ l: "Account", i: Building2 }, { l: "Industry", i: null }, { l: "Size", i: null }, { l: "Score", i: Gauge }, { l: "Signals", i: Radio }].map((c) => (
                <th key={c.l} className="sticky top-0 z-10 border-b px-2 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider" style={{ borderColor: T.border, background: T.page }}>
                  <span className="flex items-center gap-1">{c.i && <c.i size={9} style={{ opacity: 0.6 }} />}{c.l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={listV} initial={reduced ? false : "hidden"} animate="show">
            {rows.map((r, i) => (
              <motion.tr key={r.n} variants={reduced ? undefined : itemV} style={{ borderBottom: `1px solid ${T.soft}` }}>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2">
                    <motion.span className="h-1.5 w-1.5 shrink-0 rounded-full" initial={reduced ? false : { background: C.amber }} animate={{ background: C.green }} transition={{ delay: reduced ? 0 : 0.4 + i * 0.045, duration: 0.4 }} />
                    <Logo src={clogo(r.dom)} size={20} />
                    <span className="text-[11.5px] font-medium" style={{ color: T.text }}>{r.n}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-[11px]" style={{ color: T.sec }}>{r.ind}</td>
                <td className="px-2 py-2 text-[11px] tabular-nums" style={{ color: T.sec }}>{r.size}</td>
                <td className="px-2 py-2"><ScorePill score={r.s} /></td>
                <td className="px-2 py-2">
                  <span className="flex gap-1">{r.sig.map((s) => (
                    <span key={s} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium" style={{ background: C.blueSoft, color: T.accent }}><Check size={8} />{s}</span>
                  ))}</span>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
        </div>
        {/* (Removed: a translateX "light-beam" sweep that animated to x:360% and
            parked OUTSIDE the frame. A composited transform that travels past an
            overflow-hidden ancestor escapes the clip on a weak GPU and paints as
            a stray band on the right. transform-safe != travels-outside-clip-safe. */}
      </div>
    </div>
  );
}

/* ── phase 2 · Up next (priorities) ─────────────────────────────── */

function UpNextPhase({ reduced }: { reduced: boolean }) {
  // Script: a fresh signal fires and the day re-sorts itself — the account
  // that just went warm (Linear viewed pricing) springs to the top.
  const [fired, setFired] = useState(reduced);
  useEffect(() => { if (reduced) return; const t = setTimeout(() => setFired(true), 1900); return () => clearTimeout(t); }, [reduced]);
  const julien = { id: "julien", icon: Reply, tint: C.blue, t: "Reply to Julien about pricing", b: { l: "high", c: C.amber, bg: C.amberSoft }, hot: false };
  const seq = { id: "seq", icon: Send, tint: C.green, t: "Send sequence to 18 new ICP-1 accounts", b: { l: "ready", c: C.green, bg: C.greenSoft }, hot: false };
  const linearCold = { id: "linear", icon: Bell, tint: C.red, t: "Re-engage Linear · 12 days silent", b: { l: "stalled", c: C.red, bg: C.redSoft }, hot: false };
  const linearHot = { id: "linear", icon: TrendingUp, tint: T.accent, t: "Linear just posted 5 sales roles", b: { l: "now", c: T.accent, bg: C.blueSoft }, hot: true };
  const priorities = fired ? [linearHot, julien, seq] : [julien, seq, linearCold];
  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={Clock} title="Up next" count="Wed, Jun 3" />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ background: T.page }}>
        <div className="text-[14px] font-bold" style={{ color: T.text }}>Good morning, Martin</div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-3.5 py-2.5" style={{ borderColor: T.border, background: T.card }}>
          {[{ i: Building2, v: "544", l: "accounts" }, { i: Users, v: "312", l: "contacts" }, { i: DollarSign, v: "$148K", l: "pipeline" }, { i: TrendingUp, v: "9", l: "deals" }].map((s) => { const I = s.i; return (
            <div key={s.l} className="flex items-center gap-1.5"><I size={12} style={{ color: T.ter }} /><span className="text-[13px] font-bold tabular-nums" style={{ color: T.text }}>{s.v}</span><span className="text-[11px]" style={{ color: T.ter }}>{s.l}</span></div>
          ); })}
        </div>
        <div className="mb-1.5 mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>Your priorities today{fired && <motion.span initial={reduced ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ color: T.accent, background: C.blueSoft }}><Radio size={8} /> re-sorted by a live signal</motion.span>}</div>
        <LayoutGroup>
          <div className="space-y-1.5">
            {priorities.map((r) => { const Icon = r.icon; return (
              <motion.div key={r.id} layout={!reduced} layoutId={reduced ? undefined : r.id}
                transition={{ layout: { type: "spring", stiffness: 340, damping: 30 } }}
                className="relative flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: r.hot ? "rgba(44,107,237,0.5)" : T.border, background: T.card, boxShadow: r.hot ? "0 0 0 1px rgba(44,107,237,0.18)" : undefined }}>
                {r.hot && !reduced && (
                  <motion.span aria-hidden className="pointer-events-none absolute -inset-px rounded-lg" style={{ border: `1.5px solid ${T.accent}` }}
                    initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.06 }} transition={{ duration: 1, ease: "easeOut" }} />
                )}
                <span className="flex min-w-0 items-center gap-2"><Icon size={13} style={{ color: r.tint }} className="shrink-0" /><span className="truncate text-[11.5px] font-medium" style={{ color: T.text }}>{r.t}</span></span>
                <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: r.b.c, background: r.b.bg }}>{r.b.l}</span>
              </motion.div>
            ); })}
          </div>
        </LayoutGroup>
        <div className="mb-1.5 mt-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}><AlertTriangle size={10} /> Deals at risk</div>
        <div className="space-y-1.5">
          {[{ dom: "notion.so", n: "Notion · Pro plan", v: "$36K", r: 78 }, { dom: "webflow.com", n: "Webflow · Team", v: "$22K", r: 41 }].map((d) => (
            <div key={d.n} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: T.border, background: T.card }}>
              <span className="flex min-w-0 items-center gap-2"><Logo src={clogo(d.dom)} size={18} /><span className="truncate text-[11.5px] font-medium" style={{ color: T.text }}>{d.n}</span></span>
              <div className="flex shrink-0 items-center gap-2"><span className="text-[11px] font-semibold" style={{ color: C.green }}>{d.v}</span><span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: d.r >= 70 ? C.red : C.amber, background: d.r >= 70 ? C.redSoft : C.amberSoft }}>{d.r}% risk</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── phase 3 · Campaigns (sequence drafts itself, then sends) ───── */

function CampaignsPhase({ reduced }: { reduced: boolean }) {
  const [sent, setSent] = useState(reduced);
  useEffect(() => { if (reduced) return; const t = setTimeout(() => setSent(true), 4000); return () => clearTimeout(t); }, [reduced]);
  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={Zap} title="Campaigns" count="6"><HBtn icon={Plus} gradient>New campaign</HBtn></PageHeaderBar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ background: T.page }}>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: T.border, background: T.card }}>
          <div className="flex items-center justify-between border-b px-3.5 py-2" style={{ borderColor: T.soft }}>
            <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: T.text }}><Send size={13} style={{ color: T.accent }} /> Re-engage · stalled deals</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: sent ? C.green : T.sec, background: sent ? C.greenSoft : "#F3F3F8" }}>{sent ? "active" : "draft"}</span>
          </div>
          {/* multi-touch sequence: email + a cold call, this is touch 2 of 4 */}
          <div className="flex items-center gap-0.5 border-b px-3.5 py-2" style={{ borderColor: T.soft }}>
            {[{ i: Check, l: "Day 1", st: "done" }, { i: Send, l: "Day 3", st: "on" }, { i: Phone, l: "Day 5", st: "next" }, { i: Send, l: "Day 8", st: "next" }].map((s, i, arr) => { const I = s.i; const on = s.st === "on", done = s.st === "done"; return (
              <span key={i} className="flex items-center">
                <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: on ? C.blueSoft : done ? C.greenSoft : T.soft, color: on ? T.accent : done ? C.green : T.ter }}>
                  <I size={8} /> {s.l}
                </span>
                {i < arr.length - 1 && <span className="h-px w-2.5" style={{ background: T.border }} />}
              </span>
            ); })}
            <span className="ml-auto text-[9px] font-medium uppercase tracking-wider" style={{ color: T.ter }}>Email + call</span>
          </div>
          <div className="px-3.5 py-3 text-[11.5px]">
            <div className="flex items-center gap-2" style={{ color: T.sec }}><span style={{ color: T.ter }}>To</span><span className="flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: T.page, color: T.text }}><Logo src={clogo("notion.so")} name="Notion" size={14} bordered={false} /> sarah@notion.so</span></div>
            <div className="mt-2 min-h-[16px] font-semibold" style={{ color: T.text }}><Typewriter text="Re: the prospecting problem you raised" start={!reduced} delay={300} caret /></div>
            <div className="mt-1.5 min-h-[30px]" style={{ color: T.sec }}><Typewriter text="Hi Sarah, you raised this a few weeks back, then went quiet. You just posted 4 SDR roles, so the timing looks right to pick it up." start={!reduced} delay={1500} speed={17} caret /></div>
            <motion.div className="mt-2.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10.5px]" style={{ background: C.blueSoft, color: T.accent }} initial={reduced ? false : { opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20, delay: reduced ? 0 : 3.4 }}><FileText size={11} /> Drafted from Notion&apos;s signals · 12 days silent, hiring 4 SDRs</motion.div>
          </div>
          <div className="flex items-center gap-2 border-t px-3.5 py-2.5" style={{ borderColor: T.soft }}>
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.span key="s" initial={reduced ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold" style={{ background: C.greenSoft, color: C.green }}><Check size={13} /> Approved · sending to 18</motion.span>
              ) : (
                <motion.span key="a" data-action="approve" exit={reduced ? undefined : { opacity: 0 }} className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>Approve &amp; send</motion.span>
              )}
            </AnimatePresence>
            {!sent && <span className="rounded-md border px-3 py-1.5 text-[11px] font-medium" style={{ borderColor: T.border, color: T.sec }}>Edit</span>}
          </div>
        </div>
        <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>All campaigns</div>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: T.border, background: T.card }}>
          {[
            { n: "ICP-2 · SaaS founders", c: C.green, sent: "142", opened: "61%", replied: "14%" },
            { n: "Event follow-up · SaaStr", c: C.amber, sent: "76", opened: "48%", replied: "11%" },
          ].map((c, i, arr) => (
            <div key={c.n} className={`flex items-center justify-between gap-2 px-3.5 py-2 ${i < arr.length - 1 ? "border-b" : ""}`} style={{ borderColor: T.soft }}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.c }} />
                <span className="truncate text-[11.5px] font-medium" style={{ color: T.text }}>{c.n}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10.5px] tabular-nums" style={{ color: T.ter }}>
                <span><span className="font-semibold" style={{ color: T.sec }}>{c.sent}</span> sent</span>
                <span><span className="font-semibold" style={{ color: T.sec }}>{c.opened}</span> open</span>
                <span><span className="font-semibold" style={{ color: C.green }}>{c.replied}</span> reply</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── phase 4 · Meetings (call captured) ─────────────────────────── */

function MeetingsPhase({ reduced }: { reduced: boolean }) {
  // Script: the bot is on a live call -> the transcript streams in -> Elevay
  // extracts the summary, action items and buying signals on its own, ready
  // for you to review. Nothing is typed by hand.
  const [extracted, setExtracted] = useState(reduced);
  useEffect(() => { if (reduced) return; const t = setTimeout(() => setExtracted(true), 2800); return () => clearTimeout(t); }, [reduced]);
  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={Calendar} title="Meetings" count="32" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ background: T.page }}>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: T.border, background: T.card }}>
          <div className="flex items-center justify-between border-b px-3.5 py-2.5" style={{ borderColor: T.soft }}>
            <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: T.text }}><Logo src={clogo("notion.so")} name="Notion" size={18} /> Notion · Discovery call</span>
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium" style={{ color: C.red }}><motion.span className="h-1.5 w-1.5 rounded-full" style={{ background: C.red }} animate={reduced ? undefined : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} /> Recording · Zoom</span>
          </div>
          {/* attendees on the call */}
          <div className="flex items-center gap-2 border-b px-3.5 py-2" style={{ borderColor: T.soft }}>
            <span className="flex -space-x-1.5">
              <span className="rounded-full ring-2 ring-white"><Avatar name="Martin Paviot" size={20} /></span>
              <span className="rounded-full ring-2 ring-white"><Avatar name="Sarah Klein" size={20} /></span>
            </span>
            <span className="text-[10.5px]" style={{ color: T.sec }}>You, Sarah Klein <span style={{ color: T.ter }}>· COO, Notion</span></span>
            <span className="ml-auto text-[10px] tabular-nums" style={{ color: T.ter }}>32:04</span>
          </div>
          {/* live transcript streaming in */}
          <div className="space-y-1.5 px-3.5 py-2.5">
            <div className="flex gap-1.5 text-[11px]"><span className="shrink-0 font-semibold" style={{ color: T.accent }}>Sarah</span><span style={{ color: T.sec }}><Typewriter text="We lose hours every week stitching prospect lists together by hand." start={!reduced} speed={14} /></span></div>
            <div className="flex gap-1.5 text-[11px]"><span className="shrink-0 font-semibold" style={{ color: T.text }}>You</span><span style={{ color: T.sec }}><Typewriter text="That is exactly the part we automate, end to end." start={!reduced} delay={1600} speed={14} caret /></span></div>
          </div>
          {/* extraction appears once the call has been understood */}
          {extracted && (
            <motion.div variants={popV} initial={reduced ? false : "hidden"} animate="show" className="border-t px-3.5 py-3" style={{ borderColor: T.soft, background: T.page }}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.accent }}><motion.span initial={reduced ? false : { scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 13, delay: 0.12 }}><Sparkles size={11} /></motion.span> Extracted by Elevay</div>
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: T.text }}>Strong pain around manual prospecting. ~$40K budget, CFO sign-off needed, weighing Elevay against Salesforce, aiming to close in Q3.</p>
              <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>Action items</div>
              <motion.div className="mt-1.5 space-y-1.5" variants={listV} initial={reduced ? false : "hidden"} animate="show">
                {["Send security overview to Sarah", "Loop in their CFO on pricing", "Share the Q3 rollout timeline"].map((a) => (
                  <motion.div key={a} variants={reduced ? undefined : itemV} className="flex items-center gap-2 text-[11.5px]" style={{ color: T.text }}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border" style={{ borderColor: T.border, background: T.card }}><Check size={10} style={{ color: C.green }} /></span>{a}
                  </motion.div>
                ))}
              </motion.div>
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>Buying signals</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[["Budget", "~$40K"], ["Timeline", "Q3"], ["Competitor", "Salesforce"], ["Authority", "CFO sign-off"]].map(([k, v]) => (
                  <span key={k} className="rounded-full border px-2 py-0.5 text-[10.5px]" style={{ borderColor: T.border, background: T.card, color: T.sec }}>{k}: <span className="font-medium" style={{ color: T.text }}>{v}</span></span>
                ))}
              </div>
            </motion.div>
          )}
          <div className="flex items-center justify-between border-t px-3.5 py-2.5" style={{ borderColor: T.soft }}>
            <span data-action="confirm" className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>Review &amp; confirm</span>
            <span className="flex items-center gap-1 text-[10.5px]" style={{ color: T.ter }}><Mic size={11} /> Transcribed via Recall.ai</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── phase 5 · Opportunities (the deal updates itself from the call) ─ */

type Deal = { id: string; dom: string; n: string; val: string; chips: string[]; hot?: boolean; won?: boolean };

function OpportunitiesPhase({ reduced }: { reduced: boolean }) {
  const [synced, setSynced] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setSynced(true), 1900);
    return () => clearTimeout(t);
  }, [reduced]);

  // Continuity with the Meetings phase: the Notion discovery call we just
  // captured flows straight into the deal board. The card advances
  // Discovery -> Proposal, its value lands on the ~$40K from the call, and
  // it picks up the Q3 close date and Salesforce competitor from the notes.
  const notion: Deal = synced
    ? { id: "notion", dom: "notion.so", n: "Notion", val: "$40K", chips: ["Close Q3", "vs Salesforce"], hot: true }
    : { id: "notion", dom: "notion.so", n: "Notion", val: "$24K", chips: [] };

  // A full pipeline: five stages, the same ones the real Opportunities board
  // uses (Qualified -> Discovery -> Proposal -> Negotiation -> Closed Won).
  const columns: { name: string; tone: string; deals: Deal[] }[] = [
    { name: "Qualified", tone: T.ter, deals: [
      { id: "loom", dom: "loom.com", n: "Loom", val: "$12K", chips: [] },
      { id: "intercom", dom: "intercom.com", n: "Intercom", val: "$20K", chips: [] },
      { id: "posthog", dom: "posthog.com", n: "PostHog", val: "$9K", chips: [] },
    ] },
    { name: "Discovery", tone: C.blue, deals: [
      ...(synced ? [] : [notion]),
      { id: "airtable", dom: "airtable.com", n: "Airtable", val: "$18K", chips: [] },
      { id: "retool", dom: "retool.com", n: "Retool", val: "$15K", chips: [] },
    ] },
    { name: "Proposal", tone: C.amber, deals: [
      ...(synced ? [notion] : []),
      { id: "figma", dom: "figma.com", n: "Figma", val: "$52K", chips: [] },
      { id: "vercel", dom: "vercel.com", n: "Vercel", val: "$44K", chips: [] },
    ] },
    { name: "Negotiation", tone: "#C77BB0", deals: [
      { id: "webflow", dom: "webflow.com", n: "Webflow", val: "$28K", chips: [] },
      { id: "ramp", dom: "ramp.com", n: "Ramp", val: "$61K", chips: [] },
    ] },
    { name: "Closed Won", tone: C.green, deals: [
      { id: "linear", dom: "linear.app", n: "Linear", val: "$36K", chips: [], won: true },
      { id: "supabase", dom: "supabase.com", n: "Supabase", val: "$29K", chips: [], won: true },
    ] },
  ];

  const colSum = (deals: Deal[]) => deals.reduce((a, d) => a + parseInt(d.val.replace(/\D/g, ""), 10), 0);
  const openTotal = columns.filter((c) => c.name !== "Closed Won").reduce((a, c) => a + colSum(c.deals), 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={CircleDot} title="Opportunities" count={`$${openTotal}K open`}>
        <HBtn icon={Plus} gradient>New deal</HBtn>
      </PageHeaderBar>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5" style={{ background: T.page }}>
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors"
          style={{ borderColor: synced ? "rgba(78,158,134,0.4)" : "rgba(44,107,237,0.22)", background: synced ? C.greenSoft : C.blueSoft, color: T.text }}>
          {synced
            ? <Check size={13} style={{ color: C.green }} />
            : <motion.span className="inline-flex" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={12} style={{ color: T.accent }} /></motion.span>}
          {synced ? "Notion deal advanced to Proposal from your Discovery call" : "Syncing notes from Notion · Discovery call…"}
        </div>

        <LayoutGroup>
          <div className="grid grid-cols-5 gap-1.5">
            {columns.map((col) => (
              <div key={col.name} className="min-w-0">
                <div className="mb-1.5 flex items-center gap-1 px-0.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col.tone }} />
                  <span className="truncate text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: T.sec }}>{col.name}</span>
                  <span className="ml-auto shrink-0 text-[8.5px] tabular-nums" style={{ color: T.ter }}>${colSum(col.deals)}K</span>
                </div>
                <div className="space-y-1.5">
                  {col.deals.map((d) => (
                    <motion.div key={d.id} layout={!reduced} layoutId={reduced ? undefined : d.id}
                      transition={{ layout: { duration: 0.55, ease: [0.22, 0.61, 0.36, 1] } }}
                      className="relative rounded-lg border px-1.5 py-1.5"
                      style={{ background: T.card, borderColor: d.hot ? "rgba(78,158,134,0.55)" : T.border, boxShadow: d.hot ? "0 0 0 1px rgba(78,158,134,0.25)" : "0 1px 2px rgba(26,26,46,0.04)" }}>
                      {d.hot && !reduced && (
                        <motion.span aria-hidden className="pointer-events-none absolute -inset-px rounded-lg" style={{ border: `1.5px solid ${C.green}` }}
                          initial={{ opacity: 0.85, scale: 1 }} animate={{ opacity: 0, scale: 1.08 }} transition={{ duration: 1, ease: "easeOut" }} />
                      )}
                      <div className="flex items-center gap-1">
                        <Logo src={clogo(d.dom)} name={d.n} size={13} />
                        <span className="truncate text-[10px] font-medium" style={{ color: T.text }}>{d.n}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold tabular-nums" style={{ color: d.hot || d.won ? C.green : T.text }}>
                        {(d.hot || d.won) && <TrendingUp size={9} />}{d.val}
                      </div>
                      {d.chips.length > 0 && (
                        <motion.div className="mt-1 flex flex-wrap gap-0.5"
                          initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 0.45 }}>
                          {d.chips.map((c) => (
                            <span key={c} className="rounded px-1 py-0.5 text-[8px] font-medium" style={{ background: C.blueSoft, color: T.accent }}>{c}</span>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </LayoutGroup>
      </div>
    </div>
  );
}

/* ── phase 6 · Chat (real chat page) ────────────────────────────── */

function ChatPhase({ reduced }: { reduced: boolean }) {
  // Script: question -> Elevay retrieves across your real calls + emails (a
  // brief grounded "searching" beat) -> the answer streams, each fact cited.
  const [stage, setStage] = useState(reduced ? 2 : 0); // 0 asking, 1 searching, 2 answered
  useEffect(() => {
    if (reduced) return;
    const t1 = setTimeout(() => setStage(1), 1700);
    const t2 = setTimeout(() => setStage(2), 3100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduced]);
  return (
    <div className="flex h-full flex-col">
      <PageHeaderBar icon={Compass} title="Chat" count="Ask anything" />
      <div className="min-h-0 flex-1 px-4 py-3.5" style={{ background: T.page }}>
        <div className="mx-auto max-w-[420px]">
          <div className="mb-4 flex justify-end">
            <div className="max-w-[85%] rounded-[10px] px-3 py-2 text-[11.5px] text-white" style={{ background: T.accent }}>
              <Typewriter text="What did Sarah say about budget last Thursday?" start={!reduced} speed={22} />
            </div>
          </div>
          {stage === 1 && (
            <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[11px] font-medium" style={{ color: T.sec }}>
              <motion.span className="inline-flex" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={12} style={{ color: T.accent }} /></motion.span>
              Searching across 142 calls and emails…
            </motion.div>
          )}
          {stage === 2 && (
            <motion.div variants={popV} initial={reduced ? false : "hidden"} animate="show">
              <p className="text-[12px] leading-relaxed" style={{ color: T.text }}><Typewriter text="Sarah said budget approval needs CFO sign-off, but she expects ~$40K is feasible this quarter." start={!reduced} speed={13} /></p>
              <motion.div className="mt-2.5 flex flex-wrap gap-1.5" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 1.9 }}>
                {[{ i: Phone, t: "Call · Notion demo · May 28" }, { i: Inbox, t: "Email · Re: pricing · May 30" }].map((c) => { const Icon = c.i; return (
                  <span key={c.t} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ border: "1px solid rgba(44,107,237,0.25)", background: C.blueSoft, color: T.accent }}><Icon size={9} /> {c.t}</span>
                ); })}
              </motion.div>
              <motion.div className="mt-3 flex flex-wrap gap-1.5" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 2.4 }}>
                {["Draft a follow-up", "Add to deal notes"].map((s) => (
                  <span key={s} className="rounded-full border px-2.5 py-1 text-[10.5px] font-medium" style={{ borderColor: T.border, color: T.sec }}>{s}</span>
                ))}
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// `action` = the real button the agent cursor clicks mid-phase, and the ms
// at which it clicks — tuned to land exactly as that phase's animation
// fires (the email sends, the deal scores, the answer streams).
const phases: { nav: string; el: (p: { reduced: boolean }) => ReactElement; action?: { key: string; at: number } }[] = [
  { nav: "Accounts", el: AccountsPhase, action: { key: "score", at: 1500 } },
  { nav: "Campaigns", el: CampaignsPhase, action: { key: "approve", at: 3850 } },
  { nav: "Opportunities", el: OpportunitiesPhase },
];

/* ── persistent chat bar (types the query during the Chat phase) ── */

function ChatBar({ phase, reduced }: { phase: number; reduced: boolean }) {
  const asking = phase === 5;
  return (
    <div className="flex h-[44px] shrink-0 items-center border-t px-4" style={{ borderColor: T.soft, background: T.card }}>
      <div className="relative mx-auto w-full max-w-md">
        <Compass size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.ter }} />
        <div className="w-full truncate rounded-xl border py-2 pl-9 pr-9 text-[11px]" style={{ borderColor: asking ? "rgba(44,107,237,0.4)" : T.border, color: asking ? T.text : T.ter, background: T.card, boxShadow: "0 1px 2px rgba(26,26,46,0.05)" }}>
          {asking ? <Typewriter key={phase} text="What did Sarah say about budget last Thursday?" start={!reduced} speed={22} caret /> : "Show my best prospects, pipeline health, draft email…"}
        </div>
        <div data-action={asking ? "send" : undefined} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-white" style={{ background: T.accent }}><Send size={11} /></div>
      </div>
    </div>
  );
}

/* ── orchestrator ───────────────────────────────────────────────── */

export function HeroDemo() {
  const [phase, setPhase] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-100px 0px" });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    if (reduced || paused || !inView) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % phases.length), PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase, paused, inView, reduced]);

  // Agent cursor choreography: navigate to the section, then move to that
  // phase's primary button and click it exactly as the action fires — so it
  // reads as Elevay operating the app (clicks Approve, the email sends), not
  // a slideshow.
  useEffect(() => {
    if (reduced) return;
    const frame = frameRef.current;
    if (!frame) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const moveTo = (el: Element | null) => {
      if (!el) return;
      const f = frame.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setCursor({ x: r.left - f.left + 12, y: r.top - f.top + r.height / 2 - 1 });
    };
    const pulse = () => { setClicking(true); timers.push(setTimeout(() => setClicking(false), 420)); };

    setClicking(false);
    moveTo(frame.querySelector(`[data-nav="${phases[phase].nav}"]`));
    timers.push(setTimeout(pulse, 520));

    const act = phases[phase].action;
    if (act) {
      timers.push(setTimeout(() => moveTo(frame.querySelector(`[data-action="${act.key}"]`)), Math.max(720, act.at - 720)));
      // The agent clicks the action button. (Camera push-in removed: scaling
      // the overflow-hidden viewport pushes its edge past the frame clip, which
      // a weak GPU paints as a stray sliver on the right.)
      timers.push(setTimeout(pulse, act.at));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, reduced, inView]);

  const PhaseEl = phases[phase].el;

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* No background aura / glow here: large soft-colour overlays fail to
          composite on some GPUs and smear into a solid green/teal band that
          breaks the whole hero layout. Keep the stage plain. */}
      <div ref={frameRef} className="relative z-10">
        <ScaleToFit designWidth={460}>
        <AppFrame>
          <div className="flex" style={{ height: 460 }}>
            <Sidebar active={phases[phase].nav} />
            <div className="flex min-w-0 flex-1 flex-col" style={{ background: T.page }}>
              {/* Top toolbar locked to the sidebar's Elevay-logo header
                  height (42px) so the two top edges align across the shell. */}
              <div className="flex h-[42px] shrink-0 items-center gap-1.5 px-4">
                {phases.map((_, i) => (
                  <span key={i} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === phase ? 18 : 6, background: i === phase ? T.accent : "#D9DCE4" }} />
                ))}
              </div>
              <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div key={phase} className="h-full" initial={reduced ? false : { opacity: 0, y: 12, scale: 0.992 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.992 }} transition={{ duration: reduced ? 0 : 0.42, ease: [0.22, 0.61, 0.36, 1] }}>
                    <PhaseEl reduced={reduced} />
                  </motion.div>
                </AnimatePresence>
                {/* (depth-of-field overlay AND camera push-in removed — both
                    bleed past the frame clip on weak GPUs: blur composites
                    wrong, scale pushes the viewport edge outside the clip.) */}
              </div>
              <ChatBar phase={phase} reduced={reduced} />
            </div>
          </div>
        </AppFrame>
        </ScaleToFit>

        {/* (motion trail removed — radial-gradient glow dots are another
            soft-colour compositing risk on weak GPUs.) */}

        {/* multiplayer-style agent pointer (transform only — GPU-safe) */}
        {cursor && !reduced && (
          <motion.div className="pointer-events-none absolute left-0 top-0 z-30 hidden sm:block"
            initial={false} animate={{ x: cursor.x, y: cursor.y }} transition={{ type: "spring", stiffness: 130, damping: 16, mass: 0.7 }}>
            {clicking && (
              <motion.span className="absolute -left-2 -top-2 block h-8 w-8 rounded-full" style={{ border: `2px solid ${T.accent}` }}
                initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />
            )}
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M5.5 3.5L5.5 19.5L10 15.3L12.7 21L15.2 19.9L12.5 14.5L18 14.5Z" fill={T.accent} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Reused by the how-it-works step sequence: the same faithful, animated
// product surfaces, each replayed when its step scrolls into view.
export { AccountsPhase, UpNextPhase, CampaignsPhase, MeetingsPhase, OpportunitiesPhase, ChatPhase };
