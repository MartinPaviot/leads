"use client";

/**
 * HeroDemo — the self-playing product demo in the hero.
 *
 * Cycles the REAL Elevay product surfaces (the same components the app ships,
 * fed demo data by DemoSurface) inside a persistent shell — the Elevay/Martin
 * sidebar + the Ask-Elevay chat bar:
 *
 *   1. Accounts       — the scored TAM table
 *   2. Opportunities  — the deal board
 *   3. Up next        — the morning briefing
 *
 * Auto-advances (per-phase timing), pauses on hover, runs only in view, static
 * under prefers-reduced-motion. The sidebar's active item follows the cycle and
 * an agent cursor glides to it.
 */

import { useState, useEffect, useRef, type ComponentType } from "react";
import { m, AnimatePresence, useReducedMotion, useInView } from "framer-motion";
import {
  Building2, Users, CircleDot, Inbox, Phone, Clock, Zap,
  Calendar, Send, MessageSquare, Briefcase, ChevronsLeft, Search, Plus,
  type LucideIcon,
} from "lucide-react";
import { AppFrame, Avatar, ScaleToFit } from "./product-mockups";
import { RealAccounts, RealOpportunities, RealUpNext } from "./real-surfaces";

const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
// Per-phase dwell time as the hero cycles its three real surfaces.
const PHASE_MS = [7000, 6500, 6500];

/* ── helpers ─────────────────────────────────────────────────────── */

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

/* ── sidebar (mirrors components/sidebar.tsx — the REAL nav, 1:1) ──
   Sections + items + Beta tags + the Chats block are exactly today's
   navSections; the top slot is the Elevay brand identity (the Elevay mark
   + shimmer wordmark + search/collapse affordances), and the person — the
   real founder, Martin — lives at the bottom, the same split the app ships. */

const navSections: { label?: string; items: { icon: LucideIcon; label: string }[] }[] = [
  { items: [{ icon: Clock, label: "Up next" }] },
  { label: "CRM", items: [{ icon: Building2, label: "Accounts" }, { icon: Users, label: "Contacts" }, { icon: CircleDot, label: "Opportunities" }, { icon: Briefcase, label: "Proposals" }] },
  { label: "Engage", items: [{ icon: Inbox, label: "Inbox" }, { icon: Phone, label: "Call Mode" }, { icon: Zap, label: "Campaigns" }] },
  { label: "Activity", items: [{ icon: Calendar, label: "Meetings" }] },
];

// Routes that carry the Beta pill in the real sidebar (lib/beta-routes.ts).
const BETA_NAV = new Set(["Call Mode", "Campaigns", "Proposals", "Meetings"]);

function BetaPill() {
  return (
    <span className="ml-auto rounded px-[3px] py-px text-[6.5px] font-semibold uppercase tracking-wider" style={{ color: T.ter, border: `1px solid ${T.border}` }}>
      Beta
    </span>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="hidden w-[160px] shrink-0 flex-col border-r sm:flex" style={{ borderColor: T.soft, background: T.card }}>
      {/* Workspace identity — the REAL Elevay brand slot, 1:1 with the app
          sidebar header (components/sidebar.tsx): the Elevay mark + the
          shimmer wordmark; search + collapse sit right, like the app. */}
      <div className="flex h-[42px] shrink-0 items-center gap-1.5 border-b px-2.5" style={{ borderColor: T.soft }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-Elevay.svg?v=2" alt="" className="h-[18px] w-[18px] shrink-0" />
        <span className="gradient-text truncate text-[12.5px] font-bold tracking-tight">Elevay</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5" style={{ color: T.ter }}>
          <Search size={10} />
          <ChevronsLeft size={10} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1.5">
        {navSections.map((s, si) => (
          <div key={s.label || si} className={si > 0 ? "mt-1.5" : ""}>
            {s.label && <div className="mb-0.5 px-2 text-[8.5px] font-semibold uppercase tracking-wider" style={{ color: "#B4B8C4" }}>{s.label}</div>}
            <div className="space-y-px">
              {s.items.map((n) => { const Icon = n.icon; const on = n.label === active; return (
                <div key={n.label} data-nav={n.label} className="flex h-[20px] items-center gap-2 rounded-md px-2 text-[10.5px] font-medium transition-colors" style={{ color: on ? T.text : T.sec, background: on ? T.accentSoft : "transparent", boxShadow: on ? `inset 2px 0 0 0 ${T.accent}` : undefined }}>
                  <Icon size={12} className="shrink-0" style={{ color: on ? T.accent : T.ter }} />
                  <span className="truncate">{n.label}</span>
                  {BETA_NAV.has(n.label) && <BetaPill />}
                </div>
              ); })}
            </div>
          </div>
        ))}
        {/* Chats — New chat + a recent thread, like the real sidebar */}
        <div className="mt-1.5">
          <div className="mb-0.5 px-2 text-[8.5px] font-semibold uppercase tracking-wider" style={{ color: "#B4B8C4" }}>Chats</div>
          <div className="flex h-[20px] items-center gap-2 rounded-md px-2 text-[10.5px] font-medium" style={{ color: T.sec }}>
            <Plus size={12} style={{ color: T.ter }} />New chat
          </div>
          <div className="flex h-[20px] items-center gap-2 rounded-md px-2 text-[10px]" style={{ color: T.ter }}>
            <MessageSquare size={11} className="shrink-0" style={{ opacity: 0.6 }} />
            <span className="truncate">Best accounts to call</span>
          </div>
        </div>
      </div>
      {/* Footer height is locked to the chat bar's (BAR_H) so their top
          borders form one continuous line across the shell. */}
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-t px-3" style={{ borderColor: T.soft }}>
        <Avatar src="/martin_paviot.jpg" name="Martin Paviot" size={20} /><span className="text-[11px] font-medium" style={{ color: T.text }}>Martin</span>
      </div>
    </aside>
  );
}

// The hero cycles the REAL product surfaces (same components as the app),
// fed demo data by DemoSurface — the sidebar's active item follows along.
const phases: { nav: string; el: ComponentType }[] = [
  { nav: "Accounts", el: RealAccounts },
  { nav: "Opportunities", el: RealOpportunities },
  { nav: "Up next", el: RealUpNext },
];

/* ── persistent chat bar (types the query during the Chat phase) ── */

function ChatBar({ phase, reduced }: { phase: number; reduced: boolean }) {
  const asking = phase === 5;
  return (
    <div className="flex h-[44px] shrink-0 items-center border-t px-4" style={{ borderColor: T.soft, background: T.card }}>
      <div className="relative mx-auto w-full max-w-md">
        {/* The Elevay mark — the agent's face in chat, like the real app */}
        <img src="/logo-Elevay.svg?v=2" alt="" className="absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2" />
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

  // Agent cursor: glide to the active section in the sidebar and pulse, so the
  // hero reads as the agent operating the real app as it cycles through it.
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
    return () => timers.forEach(clearTimeout);
  }, [phase, reduced, inView]);

  const PhaseEl = phases[phase].el;

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* No background aura / glow here: large soft-colour overlays fail to
          composite on some GPUs and smear into a solid green/teal band that
          breaks the whole hero layout. Keep the stage plain. */}
      <div ref={frameRef} className="relative z-10">
        <ScaleToFit designWidth={1280}>
        <AppFrame>
          <div className="flex" style={{ height: 720 }}>
            <Sidebar active={phases[phase].nav} />
            <div className="flex min-w-0 flex-1 flex-col" style={{ background: T.page }}>
              {/* Top toolbar locked to the sidebar's Elevay-logo header
                  height (42px) so the two top edges align across the shell. */}
              <div className="flex h-[42px] shrink-0 items-center gap-1.5 px-4">
                {phases.map((_, i) => (
                  <span key={i} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === phase ? 18 : 6, background: i === phase ? T.accent : "#D9DCE4" }} />
                ))}
              </div>
              <div ref={viewportRef} className="no-scrollbars relative min-h-0 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <m.div key={phase} className="h-full" initial={reduced ? false : { opacity: 0, y: 12, scale: 0.992 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.992 }} transition={{ duration: reduced ? 0 : 0.42, ease: [0.22, 0.61, 0.36, 1] }}>
                    <PhaseEl />
                  </m.div>
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
          <m.div className="pointer-events-none absolute left-0 top-0 z-30 hidden sm:block"
            initial={false} animate={{ x: cursor.x, y: cursor.y }} transition={{ type: "spring", stiffness: 130, damping: 16, mass: 0.7 }}>
            {clicking && (
              <m.span className="absolute -left-2 -top-2 block h-8 w-8 rounded-full" style={{ border: `2px solid ${T.accent}` }}
                initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />
            )}
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M5.5 3.5L5.5 19.5L10 15.3L12.7 21L15.2 19.9L12.5 14.5L18 14.5Z" fill={T.accent} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </m.div>
        )}
      </div>
    </div>
  );
}

