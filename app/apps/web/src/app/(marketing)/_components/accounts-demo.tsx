"use client";

/**
 * AccountsDemo — landing step "Find demand". A faithful slice of the real
 * Accounts page: the actual `ls-table` styling and the real cell components
 * (IndustryBadge, the score grade chip, SignalChip), curated to a handful of
 * columns so it reads as "a part of the account page", in the SAME column order
 * the real app uses (Account · Industry · Score · then signals in
 * DEFAULT_SIGNALS order: Common inv. · Funded 6mo · Hiring · YC).
 *
 * It builds slowly, like a TAM constructing itself: lots of accounts stream in
 * one by one (the list auto-scrolls as it grows), each arriving scored, then its
 * signal categories COMPUTE a beat later (shimmer → resolved). Plays one loop in
 * view, static under prefers-reduced-motion, GPU-safe.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Building2, Factory, Gauge, Sparkles, Loader2, Check, type LucideIcon } from "lucide-react";
import { AppFrame, ScaleToFit, Logo, clogo } from "./product-mockups";
import { IndustryBadge } from "@/components/ui/badge";
import { SignalChip } from "@/components/signal-chip";
import { displayScore } from "@/lib/util/ui-utils";
import type { SignalKey, SignalPayload } from "@/lib/tam-stream/events";

type SigKey = Extract<SignalKey, "investor_overlap" | "funding_recent" | "hiring_intent" | "yc_company">;

// Per-account lit signals. The value carries the detail used in the popover
// reason; absence means "not detected" (renders a subtle dash).
interface Sig { investor_overlap?: string; funding_recent?: string; hiring_intent?: number; yc_company?: string }
interface Co { id: string; dom: string; name: string; industry: string; score: number; sig: Sig }

// Sorted by score DESC, like the real ranked-by-fit list.
const COS: Co[] = [
  { id: "d-mercury", dom: "mercury.com", name: "Mercury", industry: "financial services", score: 95, sig: { investor_overlap: "Sequoia", funding_recent: "Series C" } },
  { id: "d-ramp", dom: "ramp.com", name: "Ramp", industry: "financial services", score: 93, sig: { funding_recent: "Series D", hiring_intent: 3 } },
  { id: "d-retool", dom: "retool.com", name: "Retool", industry: "computer software", score: 91, sig: { hiring_intent: 3, funding_recent: "Series C" } },
  { id: "d-supabase", dom: "supabase.com", name: "Supabase", industry: "computer software", score: 90, sig: { funding_recent: "Series C", yc_company: "S20" } },
  { id: "d-linear", dom: "linear.app", name: "Linear", industry: "computer software", score: 89, sig: { hiring_intent: 2, yc_company: "S19" } },
  { id: "d-notion", dom: "notion.so", name: "Notion", industry: "computer software", score: 88, sig: { investor_overlap: "Index", hiring_intent: 4 } },
  { id: "d-posthog", dom: "posthog.com", name: "PostHog", industry: "computer software", score: 87, sig: { funding_recent: "Series B", yc_company: "W20" } },
  { id: "d-vercel", dom: "vercel.com", name: "Vercel", industry: "computer software", score: 86, sig: { investor_overlap: "Accel", hiring_intent: 5 } },
  { id: "d-figma", dom: "figma.com", name: "Figma", industry: "design", score: 85, sig: { investor_overlap: "Greylock" } },
  { id: "d-rippling", dom: "rippling.com", name: "Rippling", industry: "human resources", score: 84, sig: { funding_recent: "Series D", hiring_intent: 6 } },
  { id: "d-deel", dom: "deel.com", name: "Deel", industry: "human resources", score: 83, sig: { funding_recent: "Series D" } },
  { id: "d-clay", dom: "clay.com", name: "Clay", industry: "computer software", score: 81, sig: { investor_overlap: "Sequoia", funding_recent: "Series B" } },
  { id: "d-airtable", dom: "airtable.com", name: "Airtable", industry: "computer software", score: 80, sig: { investor_overlap: "Benchmark" } },
  { id: "d-amplitude", dom: "amplitude.com", name: "Amplitude", industry: "computer software", score: 78, sig: { investor_overlap: "Benchmark" } },
  { id: "d-intercom", dom: "intercom.com", name: "Intercom", industry: "computer software", score: 77, sig: { hiring_intent: 2 } },
  { id: "d-webflow", dom: "webflow.com", name: "Webflow", industry: "information technology & services", score: 75, sig: { hiring_intent: 1 } },
  { id: "d-gusto", dom: "gusto.com", name: "Gusto", industry: "human resources", score: 73, sig: {} },
  { id: "d-loom", dom: "loom.com", name: "Loom", industry: "information technology & services", score: 71, sig: { yc_company: "W16" } },
];

// Signal columns in the REAL app order (DEFAULT_SIGNALS: investor_overlap,
// funding_recent, hiring_intent, yc_company) with the real header labels.
const SIGNAL_COLS: { key: SigKey; label: string }[] = [
  { key: "investor_overlap", label: "Common inv." },
  { key: "funding_recent", label: "Funded 6mo" },
  { key: "hiring_intent", label: "Hiring" },
  { key: "yc_company", label: "YC" },
];

const HEADERS: { label: string; icon: LucideIcon | null }[] = [
  { label: "Account", icon: Building2 },
  { label: "Industry", icon: Factory },
  { label: "Score", icon: Gauge },
  ...SIGNAL_COLS.map((c) => ({ label: c.label, icon: Sparkles as LucideIcon })),
];

const FETCHED_AT = new Date().toISOString();
function reasonFor(key: SigKey, detail: string | number): string {
  switch (key) {
    case "investor_overlap": return `Backed by ${detail} — an investor you share.`;
    case "funding_recent": return `Raised a ${detail} in the last 6 months.`;
    case "hiring_intent": return `${detail} SDR / AE roles posted recently.`;
    case "yc_company": return `Y Combinator — ${detail} batch.`;
  }
}
function sourceFor(co: Co, key: SigKey) {
  if (key === "hiring_intent") return { url: `https://${co.dom}/careers`, title: `Careers · ${co.name}` };
  if (key === "yc_company") return { url: "https://www.ycombinator.com/companies", title: `${co.name} · Y Combinator` };
  return { url: "https://techcrunch.com/", title: `${co.name} — funding & investors` };
}
function payloadFor(co: Co, key: SigKey): SignalPayload {
  const detail = co.sig[key];
  if (detail !== undefined) {
    const s = sourceFor(co, key);
    return { value: true, reason: reasonFor(key, detail), sources: [{ url: s.url, title: s.title, fetchedAt: FETCHED_AT, verified: true }], confidence: "high", computedAt: FETCHED_AT };
  }
  return { value: false, reason: "", sources: [], confidence: "indeterminate", computedAt: FETCHED_AT };
}

const TARGET_COUNT = 312;
const START_MS = 500;
const ROW_MS = 440;    // slow, deliberate — it reads as "constructing"
const SIGNAL_MS = 260; // signals compute a beat after the row lands
const CYCLE_MS = START_MS + COS.length * ROW_MS + 4500;

/** The real account-page score chip: grade circle + heat label (displayScore). */
function ScoreCell({ score }: { score: number }) {
  const si = displayScore(score, true);
  if (!si) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: si.color }}>{si.grade}</span>
      {si.icon && <span className="text-[12px]">{si.icon}</span>}
      <span className="text-[11px] font-medium" style={{ color: si.color }}>{si.heat}</span>
    </span>
  );
}

export function AccountsDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });
  const [shown, setShown] = useState(reduced ? COS.length : 0);      // rows in the list
  const [resolved, setResolved] = useState(reduced ? COS.length : 0); // rows whose signals computed
  const [count, setCount] = useState(reduced ? TARGET_COUNT : 0);
  const [cycle, setCycle] = useState(0);
  const [openChip, setOpenChip] = useState<string | null>(null);

  useEffect(() => {
    if (reduced || !inView) return;
    setShown(0); setResolved(0); setCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    COS.forEach((_, i) => {
      timers.push(setTimeout(() => setShown(i + 1), START_MS + i * ROW_MS));
      timers.push(setTimeout(() => setResolved(i + 1), START_MS + i * ROW_MS + SIGNAL_MS));
    });
    // Counter climbs across the whole build (not instantly), so the "Building
    // TAM · N" number keeps rising the entire time accounts land.
    const buildMs = COS.length * ROW_MS;
    const step = 70;
    let c = 0;
    const counter = setInterval(() => { c = Math.min(TARGET_COUNT, c + Math.ceil((TARGET_COUNT / buildMs) * step)); setCount(c); if (c >= TARGET_COUNT) clearInterval(counter); }, step);
    const restart = setTimeout(() => setCycle((k) => k + 1), CYCLE_MS);
    timers.push(restart);
    return () => { timers.forEach(clearTimeout); clearInterval(counter); };
  }, [reduced, inView, cycle]);

  // Auto-scroll the list to the newest row, so a long TAM keeps building in view
  // (the sticky header stays put; rows glide up under it like a live feed).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [shown, reduced]);

  const done = shown >= COS.length && resolved >= COS.length;
  const pct = Math.round((count / TARGET_COUNT) * 100);

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={1040}>
        <AppFrame url="app.elevay.com/accounts">
          <div className="flex flex-col" style={{ height: 452, background: "var(--color-bg-page)" }}>
            {/* page header — title + a live TAM-build counter */}
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  <Building2 size={14} style={{ color: "var(--color-text-tertiary)" }} /> Accounts
                </div>
                <div className="mt-0.5 truncate text-[10.5px]" style={{ color: "var(--color-text-tertiary)" }}>ICP · SaaS founders, Series A–B · ranked by fit</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: done ? "var(--color-success-soft)" : "var(--color-accent-soft, rgba(44,107,237,0.08))", color: done ? "var(--color-success)" : "var(--color-accent)" }}>
                {done ? <Check size={12} /> : <Loader2 size={12} className={reduced ? "" : "animate-spin"} />}
                <span className="tabular-nums">{count}</span> {done ? "matched · scored" : "Building TAM…"}
              </div>
            </div>
            {/* thin build progress, like the real TamBuildProgress bar */}
            <div className="h-[2px] w-full shrink-0" style={{ background: "var(--color-border-default)" }}>
              <div className="h-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%`, background: "var(--color-accent)" }} />
            </div>

            {/* the real ls-table, curated to a few columns, auto-scrolling */}
            <div ref={scrollRef} className="no-scrollbars min-h-0 flex-1 overflow-y-auto">
              <table className="ls-table">
                <thead>
                  <tr>
                    {HEADERS.map((h) => (
                      <th key={h.label}>
                        <span className="flex items-center gap-1.5">
                          {h.icon && <h.icon size={12} style={{ opacity: 0.5 }} />}
                          {h.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COS.slice(0, shown).map((co, i) => {
                    const sigResolved = i < resolved;
                    return (
                      <m.tr key={co.id} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Logo src={clogo(co.dom)} name={co.name} size={22} />
                            <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{co.name}</span>
                          </div>
                        </td>
                        <td><IndustryBadge value={co.industry} /></td>
                        <td><ScoreCell score={co.score} /></td>
                        {SIGNAL_COLS.map((sc) => (
                          <td key={sc.key}>
                            <SignalChip
                              signalKey={sc.key}
                              payload={sigResolved ? payloadFor(co, sc.key) : null}
                              label={sc.label}
                              id={`${co.id}::${sc.key}`}
                              openId={openChip}
                              onOpenChange={setOpenChip}
                            />
                          </td>
                        ))}
                      </m.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </AppFrame>
      </ScaleToFit>
    </div>
  );
}
