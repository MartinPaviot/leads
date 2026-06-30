"use client";

/**
 * CallModeDemo — the self-playing cold-call cockpit, full width.
 *
 * Faithfully reproduces /call-mode (call-mode/page.tsx + _panels.tsx):
 *   - the campaign funnel bar (Today / Week / Meetings / Callable),
 *   - the three-column cockpit: "To call now" queue · brief + softphone ·
 *     call-script rail,
 *   - the real call lifecycle: idle -> dialing -> connected (live transcript,
 *     Deepgram, mm:ss timer; the queue collapses to a thin strip exactly like
 *     the real `inCall` state) -> ended (one-tap disposition) -> the outcome,
 *     deal and tasks logged, auto-advance to the next prospect.
 *
 * One full cycle ~15s, looping while in view. Static (connected snapshot)
 * under prefers-reduced-motion. All animation is transform/opacity plus
 * small-region width/height transitions — no blur, no radial gradients, no
 * composited element ever travels outside a clipping ancestor (GPU-safe).
 */

import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import {
  Phone, PhoneOff, Mic, Clock, Building2, Users, CircleDot, Inbox, Zap,
  Calendar, Briefcase, Check, Sparkles, Radio, Banknote, Target,
  SlidersHorizontal, ChevronDown, type LucideIcon,
} from "lucide-react";
import { AppFrame, Logo, ScaleToFit, clogo } from "./product-mockups";

const BRAND = "linear-gradient(90deg,#17C3B2,#2C6BED,#FF7A3D)";
const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const C = { green: "#4E9E86", greenSoft: "rgba(78,158,134,0.13)", red: "#D14B43", redSoft: "rgba(209,75,67,0.10)", amber: "#CDA25C", amberSoft: "rgba(205,162,92,0.15)", blue: "#2C6BED", blueSoft: "rgba(44,107,237,0.10)" };

type Stage = "prep" | "dialing" | "live" | "wrap" | "logged";

/* ── demo data ───────────────────────────────────────────────────── */

const QUEUE = [
  { dom: "retool.com", co: "Retool", name: "Alex Carter", title: "VP Sales", score: 86, time: "9:41 · SF", signal: "Posted 3 SDR roles" },
  { dom: "mercury.com", co: "Mercury", name: "Dana Liu", title: "Head of Growth", score: 82, time: "9:41 · SF", signal: "Raised Series B" },
  { dom: "posthog.com", co: "PostHog", name: "Sam Reed", title: "COO", score: 79, time: "12:41 · NYC", signal: null },
  { dom: "loom.com", co: "Loom", name: "Maya Patel", title: "VP Sales", score: 74, time: "9:41 · SF", signal: null },
];

// Transcript finals, the way Deepgram lands them: whole chunks, not letters.
const CHUNKS: { who: "prospect" | "agent"; text: string; ts: string; at: number }[] = [
  { who: "prospect", text: "Honestly? Half my week goes to building lists and chasing follow-ups.", ts: "00:08", at: 600 },
  { who: "agent", text: "That's the exact work we take off your plate: the list, the research, the follow-ups.", ts: "00:15", at: 2100 },
  { who: "prospect", text: "Interesting. It would need to play nice with our CRM though.", ts: "00:24", at: 3700 },
  { who: "agent", text: "It writes straight into it, both ways. Want me to show you Thursday morning?", ts: "00:31", at: 5300 },
];

const SCRIPT_PHASES = ["Founder opener", "Permission · 30 sec", "Their current setup", "Peer story", "Book or close"];

// Cycle timeline (ms from cycle start).
const AT = { cursorToDial: 1500, dial: 2400, connect: 3500, wrap: 10300, cursorToDispo: 10900, dispo: 11800, reset: 15200 };

/* ── small shared bits ───────────────────────────────────────────── */

function RailIcon({ icon: Icon, on }: { icon: LucideIcon; on?: boolean }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: on ? T.accentSoft : "transparent", boxShadow: on ? `inset 2px 0 0 0 ${T.accent}` : undefined }}>
      <Icon size={13} style={{ color: on ? T.accent : T.ter, opacity: on ? 1 : 0.7 }} />
    </span>
  );
}

function FunnelCell({ label, value, sub, bar, divider }: { label: string; value: string; sub?: string; bar?: number; divider?: boolean }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-1.5" style={divider ? { borderLeft: `1px solid ${T.border}` } : undefined}>
      <div className="truncate text-[11px]">
        <span className="mr-1.5 text-[8px] font-medium uppercase tracking-wide" style={{ color: T.ter }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: T.text }}>{value}</span>
        {sub && <span className="font-normal" style={{ color: T.ter }}> {sub}</span>}
      </div>
      {bar != null && (
        <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full" style={{ background: T.soft }}>
          {/* scaleX, not width — composited, and it never leaves the track */}
          <m.div className="h-full w-full rounded-full" style={{ background: T.accent, transformOrigin: "left" }} animate={{ scaleX: bar }} transition={{ duration: 0.6, ease: "easeOut" }} />
        </div>
      )}
    </div>
  );
}

/* ── the cockpit ─────────────────────────────────────────────────── */

export function CallModeDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });

  const [stage, setStage] = useState<Stage>(reduced ? "live" : "prep");
  const [chunkCount, setChunkCount] = useState(reduced ? CHUNKS.length : 0);
  const [secs, setSecs] = useState(reduced ? 31 : 0);
  const [cycle, setCycle] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);

  const inCall = stage === "dialing" || stage === "live";
  const logged = stage === "logged";
  // The centre stays on the call that just ended (Alex); only the QUEUE
  // advances — Alex drops off the list and Dana gets the highlight, exactly
  // the moment the real cockpit auto-advances.
  const selected = QUEUE[0];
  const queue = logged ? QUEUE.slice(1) : QUEUE;
  const highlighted = logged ? QUEUE[1] : QUEUE[0];

  // One cycle = a list of absolute timers; cleanup wipes them all, so leaving
  // the viewport mid-call simply restarts the cycle cleanly on return.
  useEffect(() => {
    if (reduced || !inView) return;
    setStage("prep"); setChunkCount(0); setSecs(0); setClicking(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const moveTo = (key: string) => {
      const frame = frameRef.current;
      const el = frame?.querySelector(`[data-act="${key}"]`);
      if (!frame || !el) return;
      const f = frame.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setCursor({ x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 });
    };
    const click = () => { setClicking(true); timers.push(setTimeout(() => setClicking(false), 420)); };

    timers.push(setTimeout(() => moveTo("dial"), AT.cursorToDial));
    timers.push(setTimeout(() => { click(); setStage("dialing"); }, AT.dial));
    timers.push(setTimeout(() => setStage("live"), AT.connect));
    CHUNKS.forEach((c, i) => timers.push(setTimeout(() => setChunkCount(i + 1), AT.connect + c.at)));
    timers.push(setTimeout(() => setStage("wrap"), AT.wrap));
    timers.push(setTimeout(() => moveTo("dispo"), AT.cursorToDispo));
    timers.push(setTimeout(() => { click(); setStage("logged"); }, AT.dispo));
    timers.push(setTimeout(() => setCycle((n) => n + 1), AT.reset));
    return () => timers.forEach(clearTimeout);
  }, [cycle, inView, reduced]);

  // The live mm:ss clock. The demo compresses a ~34s exchange into ~7s, so
  // the clock advances in demo-time (+5s per tick) to stay consistent with
  // the transcript's timestamps (00:08 … 00:31).
  useEffect(() => {
    if (reduced || stage !== "live") return;
    setSecs(3);
    const id = setInterval(() => setSecs((s) => s + 5), 1000);
    return () => clearInterval(id);
  }, [stage, reduced]);

  const mm = Math.floor(secs / 60).toString().padStart(2, "0");
  const ss = (secs % 60).toString().padStart(2, "0");
  // Script progress follows where the conversation actually is.
  const activePhase = stage === "prep" || stage === "dialing" ? 0 : chunkCount < 2 ? 2 : chunkCount < 4 ? 3 : 4;

  const callsToday = logged ? 13 : 12;

  return (
    <div ref={ref} className="relative">
      <div ref={frameRef} className="relative z-10">
        {/* designWidth matches the other process-step demos (1080) so the cockpit
            renders at the SAME scale as its siblings — no oversized "zoomed-in"
            outlier in the half-width lineup. Height stays 470 (content unchanged). */}
        <ScaleToFit designWidth={1080}>
          <AppFrame url="app.elevay.com/call-mode">
            <div className="flex" style={{ height: 470, background: T.page }} aria-hidden="true">
              {/* Collapsed icon nav — the real sidebar's small-screen state */}
              <div className="flex w-[40px] shrink-0 flex-col items-center gap-0.5 border-r py-2" style={{ borderColor: T.soft, background: T.card }}>
                {[Clock, Building2, Users, CircleDot, Briefcase, Inbox, Phone, Zap, Calendar].map((I, i) => <RailIcon key={i} icon={I} on={I === Phone} />)}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                {/* PageHeader — title + the campaign goal subtitle + actions */}
                <div className="flex h-[40px] shrink-0 items-center gap-2.5 border-b px-3.5" style={{ borderColor: T.border, background: T.card }}>
                  <Phone size={14} style={{ color: T.ter }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: T.text }}>Call Mode</span>
                  <span className="truncate text-[10.5px]" style={{ color: T.ter }}>Goal: 200 calls this week - 40 calls/day, retry up to 4x over 15d</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9.5px]" style={{ borderColor: T.border, color: T.sec, background: T.page }}>Sprint: SaaS sales leaders</span>
                    <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9.5px] tabular-nums" style={{ borderColor: T.border, color: T.sec }}><Phone size={9} /> +1 (415) 212-0455 <ChevronDown size={9} style={{ color: T.ter }} /></span>
                    <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9.5px] font-medium" style={{ borderColor: T.border, color: T.sec }}><SlidersHorizontal size={9} /> Edit plan</span>
                  </div>
                </div>

                {/* Campaign funnel bar — collapses during the call, like the real one */}
                <div className="shrink-0 overflow-hidden border-b transition-[max-height,opacity] duration-300 ease-out" style={{ borderColor: T.border, background: T.card, maxHeight: inCall ? 0 : 40, opacity: inCall ? 0 : 1 }}>
                  <div className="flex items-center">
                    <div className="px-3 py-1.5">
                      <div className="flex gap-0.5 rounded-md border p-0.5" style={{ borderColor: T.border, background: T.page }}>
                        {(["Me", "Team"] as const).map((k, i) => (
                          <span key={k} className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: i === 0 ? T.accentSoft : "transparent", color: i === 0 ? T.accent : T.ter }}>{k}</span>
                        ))}
                      </div>
                    </div>
                    <FunnelCell label="Today" value={`${callsToday}`} sub="/ 40 calls" bar={callsToday / 40} />
                    <FunnelCell label="Week" value="86" sub="/ 200 calls" bar={86 / 200} divider />
                    <FunnelCell label="Meetings" value={logged ? "5" : "4"} sub="this week" divider />
                    <FunnelCell label="Cadence" value="28 due" sub="· 64 in cadence · 19 reached" divider />
                    <FunnelCell label="Callable" value="132" sub="/ 180 have a phone" divider />
                  </div>
                </div>

                <div className="flex min-h-0 flex-1">
                  {/* LEFT — queue: full in prep, thin strip when live (real inCall behavior) */}
                  <aside className="relative shrink-0 overflow-hidden border-r transition-[width] duration-300 ease-out" style={{ width: inCall ? 54 : 192, borderColor: T.border, background: T.card }}>
                    <div className="absolute inset-y-0 left-0 flex w-[192px] flex-col transition-opacity duration-200" style={{ opacity: inCall ? 0 : 1 }}>
                      <div className="border-b px-3 py-2" style={{ borderColor: T.border }}>
                        <div className="text-[11px] font-semibold" style={{ color: T.text }}>To call now</div>
                        <div className="text-[9px]" style={{ color: T.ter }}>{logged ? 17 : 18} contacts</div>
                        <div className="mt-1.5 flex gap-1">
                          {["All", "High intent"].map((f, i) => (
                            <span key={f} className="rounded-full border px-1.5 py-px text-[8.5px]" style={i === 0 ? { background: T.text, color: "#fff", borderColor: T.text } : { borderColor: T.border, color: T.sec }}>{f}</span>
                          ))}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        {queue.map((q) => { const on = q === highlighted; return (
                          <div key={q.co} className="relative border-b px-3 py-2" style={{ borderColor: T.soft, background: on ? T.accentSoft : "transparent" }}>
                            {on && <span className="absolute inset-y-0 left-0 w-[2px] rounded-r" style={{ background: T.accent }} />}
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex min-w-0 items-start gap-1.5">
                                <Logo src={clogo(q.dom)} name={q.co} size={18} />
                                <div className="min-w-0">
                                  <div className="truncate text-[10.5px] font-semibold leading-tight" style={{ color: T.text }}>{q.name}</div>
                                  <div className="truncate text-[8.5px] leading-tight" style={{ color: T.ter }}>{q.title} · {q.co}</div>
                                </div>
                              </div>
                              <span className="shrink-0 rounded-full px-1 py-px text-[8.5px] font-semibold tabular-nums" style={{ background: T.soft, color: T.sec }}>{q.score}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[8px]" style={{ color: T.ter }}>
                              <span className="flex items-center gap-0.5"><Clock size={7} />{q.time}</span>
                              {q.signal && <span className="flex min-w-0 items-center gap-0.5" style={{ color: T.sec }}><Sparkles size={7} className="shrink-0" /><span className="truncate">{q.signal}</span></span>}
                            </div>
                          </div>
                        ); })}
                      </div>
                    </div>
                    {/* Thin live strip — count + who's next */}
                    <div className="absolute inset-0 flex flex-col items-center gap-2.5 px-1 py-3 transition-opacity duration-200" style={{ opacity: inCall ? 1 : 0 }}>
                      <div className="text-center">
                        <div className="text-[13px] font-semibold tabular-nums" style={{ color: T.text }}>17</div>
                        <div className="text-[7px] font-medium uppercase tracking-wide" style={{ color: T.ter }}>queued</div>
                      </div>
                      <div className="h-px w-5" style={{ background: T.border }} />
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[7px] font-medium uppercase tracking-wide" style={{ color: T.ter }}>next</span>
                        <Logo src={clogo("mercury.com")} name="Mercury" size={22} />
                        <span className="text-[8px]" style={{ color: T.sec }}>Dana</span>
                      </div>
                    </div>
                  </aside>

                  {/* CENTER — brief + softphone, then the live transcript */}
                  <main className="flex min-w-0 flex-1 flex-col">
                    <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: T.border, background: T.card }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Logo src={clogo(selected.dom)} name={selected.co} size={26} />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: T.text }}>{selected.name}</div>
                            <div className="flex items-center gap-1.5 truncate text-[9.5px]" style={{ color: T.ter }}>
                              {selected.title} · {selected.co}
                              <span className="flex items-center gap-0.5 font-medium tabular-nums" style={{ color: T.sec }}><Phone size={8} style={{ color: T.ter }} /> +1 (415) 555-0183</span>
                            </div>
                          </div>
                        </div>
                        {/* Softphone states — idle / dialing / connected / ended */}
                        <div className="flex shrink-0 items-center gap-2">
                          <AnimatePresence mode="wait" initial={false}>
                            {stage === "prep" && (
                              <m.span key="call" data-act="dial" exit={reduced ? undefined : { opacity: 0, scale: 0.96 }} className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>
                                <Phone size={11} /> Call
                              </m.span>
                            )}
                            {stage === "dialing" && (
                              <m.span key="dialing" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[10.5px]" style={{ color: T.sec }}>
                                Dialing +1 (415) 555-0183…
                                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium" style={{ borderColor: T.border, color: T.sec }}><PhoneOff size={10} /> Cancel</span>
                              </m.span>
                            )}
                            {stage === "live" && (
                              <m.span key="live" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                <span className="font-mono text-[11px] tabular-nums" style={{ color: C.red }}>{mm}:{ss}</span>
                                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium" style={{ borderColor: T.border, color: T.sec }}><Mic size={10} /> Mute</span>
                                <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-white" style={{ background: C.red }}><PhoneOff size={10} /> End call</span>
                              </m.span>
                            )}
                            {(stage === "wrap" || stage === "logged") && (
                              <m.span key="ended" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="text-[10.5px]" style={{ color: T.ter }}>Call ended · 00:34</m.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    <div className="relative min-h-0 flex-1">
                      {/* Pre-call expert brief (idle/dialing) — _panels.tsx PreCallBrief */}
                      <div className="absolute inset-0 overflow-hidden px-4 py-3 transition-opacity duration-300" style={{ opacity: stage === "prep" || stage === "dialing" ? 1 : 0 }}>
                        <div className="overflow-hidden rounded-lg border" style={{ borderColor: T.border, background: T.card }}>
                          <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(16,185,129,0.07)" }}>
                            <Target size={12} className="shrink-0" style={{ color: "rgb(16,185,129)" }} />
                            <div className="min-w-0">
                              <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: T.ter }}>Authority</div>
                              <div className="truncate text-[10.5px] font-medium" style={{ color: T.text }}>Probable decision-maker <span className="font-normal" style={{ color: T.sec }}>· VP Sales · sourced 12 days ago</span></div>
                            </div>
                          </div>
                          <div className="border-t px-3 py-2" style={{ borderColor: T.soft }}>
                            <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: T.ter }}>Why call now</div>
                            <div className="mt-1 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.text }}>
                                <Radio size={9} style={{ color: T.accent }} /> Posted 3 SDR roles this week
                                <span className="rounded-full px-1.5 py-px text-[8px] font-semibold" style={{ color: T.accent, background: C.blueSoft }}>Signal</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.text }}>
                                <Banknote size={9} style={{ color: C.green }} /> $45M raised · Series B (Feb 2026)
                                <span className="rounded-full px-1.5 py-px text-[8px] font-semibold" style={{ color: C.green, background: C.greenSoft }}>Funding</span>
                              </div>
                            </div>
                          </div>
                          <div className="border-t px-3 py-2" style={{ borderColor: T.soft }}>
                            <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: T.ter }}>Relationship</div>
                            <div className="mt-0.5 text-[10px]" style={{ color: T.sec }}>First contact, never touched. Open on the hiring spike, not a pitch.</div>
                          </div>
                        </div>
                      </div>

                      {/* Live transcript (connected/ended) — _panels.tsx LiveTranscript */}
                      <div className="absolute inset-0 flex flex-col transition-opacity duration-300" style={{ opacity: stage === "live" || stage === "wrap" || stage === "logged" ? 1 : 0 }}>
                        <div className="flex shrink-0 items-center justify-between border-b px-4 py-1.5" style={{ borderColor: T.border, background: T.card }}>
                          <div className="flex items-center gap-2 text-[9.5px]">
                            {stage === "live" ? (
                              <>
                                <span className="relative flex h-1.5 w-1.5">
                                  <m.span className="absolute inline-flex h-full w-full rounded-full" style={{ background: C.red }} animate={reduced ? undefined : { opacity: [0.7, 0, 0.7], scale: [1, 2.2, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />
                                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: C.red }} />
                                </span>
                                <span className="font-medium" style={{ color: C.red }}>Live</span>
                              </>
                            ) : (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.ter }} />
                                <span style={{ color: T.ter }}>Call ended · transcript frozen</span>
                              </>
                            )}
                            <span className="flex items-center gap-1" style={{ color: T.ter }}><Radio size={8} /> Deepgram Nova-3</span>
                          </div>
                          <span className="font-mono text-[9.5px] tabular-nums" style={{ color: T.sec }}>{stage === "live" ? `${mm}:${ss}` : "00:34"}</span>
                        </div>
                        <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden px-4 py-2.5">
                          {CHUNKS.slice(0, chunkCount).map((c, i) => {
                            const agent = c.who === "agent";
                            return (
                              <m.div key={i} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className={`flex ${agent ? "justify-end" : "justify-start"}`}>
                                <div className={`flex max-w-[78%] flex-col ${agent ? "items-end" : "items-start"}`}>
                                  <span className="mb-px text-[7.5px] uppercase tracking-wide" style={{ color: agent ? "#6366F1" : T.ter }}>{agent ? "You" : "Prospect"} <span style={{ color: T.border }}>{c.ts}</span></span>
                                  <div className={`px-2.5 py-1.5 text-[10px] leading-snug ${agent ? "rounded-lg rounded-br-sm text-white" : "rounded-lg rounded-bl-sm"}`} style={agent ? { background: "#4F46E5" } : { background: T.soft, color: T.text }}>
                                    {c.text}
                                  </div>
                                </div>
                              </m.div>
                            );
                          })}
                          {stage === "live" && chunkCount === 0 && (
                            <div className="flex h-full items-center justify-center text-[10px]" style={{ color: T.ter }}>Listening… the transcript lands at the first word.</div>
                          )}
                        </div>
                        {/* Post-call: what the autopilot just captured + execution read */}
                        <AnimatePresence>
                          {logged && (
                            <m.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="shrink-0 border-t px-4 py-2" style={{ borderColor: T.border, background: T.card }}>
                              <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: C.green }}>
                                <Check size={11} /> Meeting booked · captured: deal created, 2 tasks
                              </div>
                              <div className="mt-0.5 text-[8.5px]" style={{ color: T.ter }}>Execution · you spoke 54% (target ~55%) · next: Dana Liu, Mercury</div>
                            </m.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* One-tap disposition — the real ended-state modal */}
                      <AnimatePresence>
                        {stage === "wrap" && (
                          <m.div key="dispo" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(26,26,46,0.28)" }}>
                            <m.div initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 280, damping: 22 }} className="w-[280px] rounded-xl border bg-white p-3.5" style={{ borderColor: T.border, boxShadow: "0 12px 32px rgba(26,26,46,0.18)" }}>
                              <div className="text-[11.5px] font-semibold" style={{ color: T.text }}>How did it go with Alex?</div>
                              <div className="mt-0.5 text-[9px]" style={{ color: T.ter }}>Logs the outcome, updates the cadence and the CRM.</div>
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                <span data-act="dispo" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold text-white" style={{ background: BRAND }}><Calendar size={10} /> Meeting booked</span>
                                {["Callback", "No answer", "Not interested"].map((o) => (
                                  <span key={o} className="rounded-md border px-2.5 py-1.5 text-[10px] font-medium" style={{ borderColor: T.border, color: T.sec }}>{o}</span>
                                ))}
                              </div>
                              <div className="mt-2 flex items-center gap-1 text-[8.5px]" style={{ color: T.ter }}><Sparkles size={8} /> Suggested from the transcript</div>
                            </m.div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </main>

                  {/* RIGHT — the call-script rail, advancing with the conversation */}
                  <aside className="w-[196px] shrink-0 overflow-hidden border-l" style={{ borderColor: T.border, background: T.card }}>
                    <div className="border-b px-3 py-2" style={{ borderColor: T.border }}>
                      <div className="text-[10.5px] font-semibold" style={{ color: T.text }}>Call script</div>
                      <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-medium" style={{ color: T.accent, background: C.blueSoft }}>
                        <Radio size={8} className="shrink-0" /><span className="truncate">Reason: hiring 3 SDRs</span>
                      </div>
                    </div>
                    <div className="space-y-0.5 px-2 py-2">
                      {SCRIPT_PHASES.map((p, i) => {
                        const isDone = stage === "wrap" || stage === "logged" ? true : i < activePhase;
                        const active = !isDone && i === activePhase;
                        return (
                          <div key={p} className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-300" style={{ background: active && !isDone ? T.accentSoft : "transparent" }}>
                            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300" style={{ borderColor: isDone ? C.green : active ? T.accent : T.border, background: isDone ? C.greenSoft : T.card }}>
                              {isDone ? <Check size={8} style={{ color: C.green }} /> : <span className="text-[7px] font-bold" style={{ color: active ? T.accent : T.ter }}>{i + 1}</span>}
                            </span>
                            <span className="truncate text-[9.5px] font-medium" style={{ color: active && !isDone ? T.text : isDone ? T.sec : T.ter }}>{p}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mx-2 rounded-lg border px-2.5 py-2 text-[9px] leading-relaxed" style={{ borderColor: T.soft, background: T.page, color: T.sec }}>
                      <span className="font-semibold" style={{ color: T.text }}>Peer story.</span> A founder selling to the same segment cut list-building from 6 h to 20 min a week. Tell it, then ask what their setup looks like.
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </AppFrame>
        </ScaleToFit>

        {/* Agent pointer (transform only — GPU-safe), same dialect as the hero */}
        {cursor && !reduced && (
          <m.div className="pointer-events-none absolute left-0 top-0 z-30 hidden sm:block" initial={false} animate={{ x: cursor.x, y: cursor.y }} transition={{ type: "spring", stiffness: 130, damping: 16, mass: 0.7 }}>
            {clicking && (
              <m.span className="absolute -left-2 -top-2 block h-8 w-8 rounded-full" style={{ border: `2px solid ${T.accent}` }} initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />
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
