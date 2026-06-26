"use client";

/**
 * AccountsDemo — landing step "Find demand". A faithful slice of the real
 * Accounts page: the actual `ls-table` styling, the literal app cell components
 * (CompanyLogo, IndustryBadge, the score grade chip, SignalChip) and the SAME
 * column order the real app uses, left to right:
 *
 *   Account · Industry · Geography · Size · Score · <signals>
 *
 * where the signal columns follow DEFAULT_SIGNALS order (Common inv. · Funded
 * 6mo · Hiring · YC) with the real header labels + Sparkles icon. Firmographics
 * (Geography, Size) sit BEFORE the score exactly as on the live page, so the
 * score never jumps to the front.
 *
 * The table is `table-layout: fixed` with an explicit <colgroup>, so column
 * widths are locked from the first frame: rows stream in WITHOUT the columns
 * reflowing/expanding as longer values arrive (the bug that read as unfinished).
 *
 * It builds slowly, like a TAM constructing itself: accounts stream in one by
 * one (the list auto-scrolls to follow the newest), each arriving scored, then
 * its signal categories COMPUTE a beat later (shimmer → resolved). When the
 * build settles it glides back to the top to reveal the best-fit leaders. Plays
 * one loop in view, static under prefers-reduced-motion, GPU-safe.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Building2, Factory, MapPin, Ruler, Gauge, Sparkles, Loader2, Check, type LucideIcon } from "lucide-react";
import { AppFrame, ScaleToFit } from "./product-mockups";
import { IndustryBadge } from "@/components/ui/badge";
import { SignalChip } from "@/components/signal-chip";
import { displayScore } from "@/lib/util/ui-utils";
import type { SignalKey, SignalPayload } from "@/lib/tam-stream/events";

type SigKey = Extract<SignalKey, "investor_overlap" | "funding_recent" | "hiring_intent" | "yc_company">;

// Per-account lit signals. The value carries the detail used in the popover
// reason; absence means "not detected" (renders a subtle dash).
interface Sig { investor_overlap?: string; funding_recent?: string; hiring_intent?: number; yc_company?: string }
interface Co { id: string; dom: string; name: string; desc: string; industry: string; geo: string; size: string; score: number; sig: Sig }

// Sorted by score DESC, like the real ranked-by-fit list. Real firmographics
// (HQ city + employee band) so the Geography/Size columns read like live data.
const COS: Co[] = [
  { id: "d-mercury", dom: "mercury.com", name: "Mercury", desc: "Banking built for startups", industry: "financial services", geo: "San Francisco, US", size: "501-1000", score: 95, sig: { investor_overlap: "Sequoia", funding_recent: "Series C" } },
  { id: "d-ramp", dom: "ramp.com", name: "Ramp", desc: "Corporate cards & spend", industry: "financial services", geo: "New York, US", size: "501-1000", score: 93, sig: { funding_recent: "Series D", hiring_intent: 3 } },
  { id: "d-retool", dom: "retool.com", name: "Retool", desc: "Internal tools, fast", industry: "computer software", geo: "San Francisco, US", size: "201-500", score: 91, sig: { hiring_intent: 3, funding_recent: "Series C" } },
  { id: "d-supabase", dom: "supabase.com", name: "Supabase", desc: "Open-source Firebase", industry: "computer software", geo: "San Francisco, US", size: "51-200", score: 90, sig: { funding_recent: "Series C", yc_company: "S20" } },
  { id: "d-linear", dom: "linear.app", name: "Linear", desc: "Issue tracking for teams", industry: "computer software", geo: "San Francisco, US", size: "51-200", score: 89, sig: { hiring_intent: 2, yc_company: "S19" } },
  { id: "d-notion", dom: "notion.so", name: "Notion", desc: "The connected workspace", industry: "computer software", geo: "San Francisco, US", size: "501-1000", score: 88, sig: { investor_overlap: "Index", hiring_intent: 4 } },
  { id: "d-posthog", dom: "posthog.com", name: "PostHog", desc: "Product analytics, open source", industry: "computer software", geo: "San Francisco, US", size: "51-200", score: 87, sig: { funding_recent: "Series B", yc_company: "W20" } },
  { id: "d-vercel", dom: "vercel.com", name: "Vercel", desc: "The frontend cloud", industry: "computer software", geo: "San Francisco, US", size: "501-1000", score: 86, sig: { investor_overlap: "Accel", hiring_intent: 5 } },
  { id: "d-figma", dom: "figma.com", name: "Figma", desc: "Collaborative interface design", industry: "design", geo: "San Francisco, US", size: "1001-5000", score: 85, sig: { investor_overlap: "Greylock" } },
  { id: "d-rippling", dom: "rippling.com", name: "Rippling", desc: "HR, IT & payroll in one", industry: "human resources", geo: "San Francisco, US", size: "1001-5000", score: 84, sig: { funding_recent: "Series D", hiring_intent: 6 } },
  { id: "d-deel", dom: "deel.com", name: "Deel", desc: "Global payroll & compliance", industry: "human resources", geo: "San Francisco, US", size: "1001-5000", score: 83, sig: { funding_recent: "Series D" } },
  { id: "d-clay", dom: "clay.com", name: "Clay", desc: "GTM data automation", industry: "computer software", geo: "New York, US", size: "51-200", score: 81, sig: { investor_overlap: "Sequoia", funding_recent: "Series B" } },
  { id: "d-airtable", dom: "airtable.com", name: "Airtable", desc: "Spreadsheet-database hybrid", industry: "computer software", geo: "San Francisco, US", size: "501-1000", score: 80, sig: { investor_overlap: "Benchmark" } },
  { id: "d-amplitude", dom: "amplitude.com", name: "Amplitude", desc: "Digital analytics platform", industry: "computer software", geo: "San Francisco, US", size: "501-1000", score: 78, sig: { investor_overlap: "Benchmark" } },
  { id: "d-intercom", dom: "intercom.com", name: "Intercom", desc: "AI-first customer service", industry: "computer software", geo: "Dublin, IE", size: "501-1000", score: 77, sig: { hiring_intent: 2 } },
  { id: "d-webflow", dom: "webflow.com", name: "Webflow", desc: "Visual website builder", industry: "information technology & services", geo: "San Francisco, US", size: "201-500", score: 75, sig: { hiring_intent: 1 } },
  { id: "d-gusto", dom: "gusto.com", name: "Gusto", desc: "Payroll & benefits for SMBs", industry: "human resources", geo: "San Francisco, US", size: "1001-5000", score: 73, sig: {} },
  { id: "d-loom", dom: "loom.com", name: "Loom", desc: "Async video messaging", industry: "information technology & services", geo: "San Francisco, US", size: "201-500", score: 71, sig: { yc_company: "W16" } },
];

// Signal columns in the REAL app order (DEFAULT_SIGNALS) with real header labels.
const SIGNAL_COLS: { key: SigKey; label: string; w: number }[] = [
  { key: "investor_overlap", label: "Common inv.", w: 96 },
  { key: "funding_recent", label: "Funded 6mo", w: 100 },
  { key: "hiring_intent", label: "Hiring", w: 80 },
  { key: "yc_company", label: "YC", w: 82 },
];

// The whole column set with the LOCKED width that drives both the <colgroup>
// and the <th> row — one source so they can never skew. Order + icons mirror
// the live Accounts header exactly (Account/Industry/Geography/Size/Score =
// Building2/Factory/MapPin/Ruler/Gauge; every signal = Sparkles). Widths sum to
// the design width so table-layout:fixed has no slack to redistribute.
const COLS: { label: string; icon: LucideIcon; w: number }[] = [
  { label: "Account", icon: Building2, w: 232 },
  { label: "Industry", icon: Factory, w: 150 },
  { label: "Geography", icon: MapPin, w: 138 },
  { label: "Size", icon: Ruler, w: 84 },
  { label: "Score", icon: Gauge, w: 118 },
  ...SIGNAL_COLS.map((c) => ({ label: c.label, icon: Sparkles as LucideIcon, w: c.w })),
];
const DESIGN_WIDTH = COLS.reduce((sum, c) => sum + c.w, 0); // 1080

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

// Faithful company logo — mirrors the app's effective CompanyLogo output: a
// Google-favicon-128 on a rounded tile, falling back to seeded-colour initials
// (same FNV-1a palette as the dashboard) on load error. Goes straight to the
// favicon — the legacy logo.clearbit.com source is dead, so we skip it to avoid
// a guaranteed failed request + console 404 per row. Decoupled from the
// dashboard logo module so the marketing bundle stays lean.
const LOGO_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#f43f5e", "#14b8a6"] as const;
function logoColor(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return LOGO_COLORS[(h >>> 0) % LOGO_COLORS.length];
}
function logoInitials(name: string): string {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
function FaithfulLogo({ domain, name, size = 24 }: { domain: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = logoInitials(name);
  const bg = logoColor(domain.toLowerCase());
  const fontSize = size <= 20 ? 9 : size <= 28 ? 10 : 11;
  if (failed) {
    return <div className="flex shrink-0 items-center justify-center rounded font-semibold text-white" style={{ width: size, height: size, background: bg, fontSize }} aria-hidden>{initials}</div>;
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt=""
        className="absolute inset-0 rounded object-contain"
        style={{ width: size, height: size, background: "var(--color-bg-hover)" }}
        onError={() => setFailed(true)}
      />
      <div className="flex items-center justify-center rounded font-semibold text-white" style={{ width: size, height: size, background: bg, fontSize }} aria-hidden>{initials}</div>
    </div>
  );
}

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

  const done = shown >= COS.length && resolved >= COS.length;

  // Auto-scroll: follow the newest row while the TAM builds (rows glide up under
  // the sticky header like a live feed), then glide back to the top once it
  // settles, to reveal the best-fit leaders the build just ranked.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (done) {
      const t = setTimeout(() => el.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }), 700);
      return () => clearTimeout(t);
    }
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [shown, done, reduced]);

  const pct = Math.round((count / TARGET_COUNT) * 100);

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={DESIGN_WIDTH}>
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

            {/* the real ls-table, fixed-width columns, auto-scrolling */}
            <div ref={scrollRef} className="no-scrollbars min-h-0 flex-1 overflow-y-auto">
              <table className="ls-table" style={{ tableLayout: "fixed", width: "100%" }}>
                <colgroup>
                  {COLS.map((c) => (<col key={c.label} style={{ width: c.w }} />))}
                </colgroup>
                <thead>
                  <tr>
                    {COLS.map((h) => (
                      <th key={h.label}>
                        <span className="flex items-center gap-1.5">
                          <h.icon size={12} style={{ opacity: 0.5 }} />
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
                        {/* Account — real CompanyLogo + name + description (2-line, like the live cell) */}
                        <td className="align-middle">
                          <div className="flex items-center gap-2">
                            <FaithfulLogo domain={co.dom} name={co.name} size={24} />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{co.name}</div>
                              <div className="truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{co.desc}</div>
                            </div>
                          </div>
                        </td>
                        {/* Industry — real sector-hued badge */}
                        <td className="align-middle"><IndustryBadge value={co.industry} /></td>
                        {/* Geography — MapPin + city, country (real cell markup) */}
                        <td className="align-middle">
                          <span className="inline-flex max-w-full items-center gap-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }} title={co.geo}>
                            <MapPin size={11} className="shrink-0" style={{ color: "var(--color-text-muted)" }} />
                            <span className="min-w-0 truncate">{co.geo}</span>
                          </span>
                        </td>
                        {/* Size — plain firmographic text */}
                        <td className="align-middle text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{co.size}</td>
                        {/* Score — real grade chip + heat */}
                        <td className="align-middle"><ScoreCell score={co.score} /></td>
                        {/* Signals — real SignalChip, shimmer until computed */}
                        {SIGNAL_COLS.map((sc) => (
                          <td key={sc.key} className="align-middle">
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
