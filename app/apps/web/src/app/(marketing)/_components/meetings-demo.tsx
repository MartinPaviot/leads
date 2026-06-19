"use client";

/**
 * MeetingsDemo — self-playing "every meeting captured" surface (landing step
 * Capture). Same model as CampaignsDemo/CallModeDemo: a real-looking Elevay
 * surface that plays one short loop in view, static under reduced-motion,
 * GPU-safe (opacity/transform only).
 *
 * The story: the notetaker bot joins a live call, records, the transcript fills
 * in chunk by chunk (the way Deepgram lands finals), Elevay distils a live
 * summary, then extracts the action items + buying signals and logs the whole
 * thing to the CRM — no manual entry. Content fills the window top-and-bottom
 * (transcript + pinned summary on the left, panel + pinned sync on the right)
 * so there's no hollow void.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Video, Radio, Check, Sparkles, ListChecks, TrendingUp } from "lucide-react";
import { AppFrame, ScaleToFit, Avatar } from "./product-mockups";

const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const RED = "#D14B43";
const GREEN = "#4E9E86";
const GREEN_SOFT = "rgba(78,158,134,0.13)";

const CHUNKS: { who: string; name: string; text: string }[] = [
  { who: "prospect", name: "Dana Liu", text: "We're growing the team fast, so onboarding new reps is the bottleneck right now." },
  { who: "you", name: "You", text: "That's exactly where Elevay helps — the list, research and follow-ups are done before they start." },
  { who: "prospect", name: "Dana Liu", text: "Budget's approved for Q3. I'd want to see it write into our CRM though." },
  { who: "you", name: "You", text: "It logs every call straight into your CRM. I'll send the one-pager and book a technical review." },
];
const SUMMARY = "Strong fit — budget approved for Q3, CRM-sync is the deciding factor.";
const ACTIONS = ["Send the CRM-sync one-pager", "Book a technical review for Thursday"];
const SIGNALS = [
  { label: "Budget approved · Q3", tone: GREEN },
  { label: "Timeline: this quarter", tone: T.accent },
];

// join · rec+c1 · c2 · c3 · c4 · summary+actions · signals+sync
const PHASES = [0, 900, 2000, 3100, 4200, 5500, 6900];
const LAST = PHASES.length - 1;
const CYCLE_MS = 9800;

export function MeetingsDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });
  const [phase, setPhase] = useState(reduced ? LAST : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    setPhase(0);
    const timers = PHASES.map((ms, i) => setTimeout(() => setPhase(i), ms));
    const restart = setTimeout(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(restart); };
  }, [reduced, inView, cycle]);

  const recording = phase >= 1;
  const chunksShown = phase >= 1 ? Math.min(CHUNKS.length, phase) : 0;
  const showSummary = phase >= 5;
  const showActions = phase >= 5;
  const showSignals = phase >= 6;
  const showSync = phase >= 6;

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={1080}>
        <AppFrame url="app.elevay.com/meetings">
          <div className="grid grid-cols-[1fr_320px]" style={{ height: 450, background: T.page }}>
            {/* ── Call + transcript ── */}
            <div className="flex min-h-0 flex-col p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: T.accentSoft, color: T.accent }}><Video size={16} /></span>
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: T.text }}>Discovery · Mercury</div>
                    <div className="text-[10px]" style={{ color: T.ter }}>Zoom · 2 participants</div>
                  </div>
                </div>
                <m.div
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: recording ? "rgba(209,75,67,0.10)" : T.soft, color: recording ? RED : T.ter }}
                  initial={false}
                >
                  {recording ? <><Radio size={11} className={reduced ? "" : "animate-pulse"} /> Recording</> : <>Notetaker joining…</>}
                </m.div>
              </div>

              {/* transcript card: messages flow at the top, a live summary is
                  pinned to the bottom — frames the card so it never reads hollow */}
              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border" style={{ borderColor: T.border, background: T.card }}>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden p-4">
                  {CHUNKS.slice(0, chunksShown).map((c, i) => (
                    <m.div
                      key={i}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex gap-2"
                    >
                      <Avatar name={c.name} size={22} />
                      <div className="min-w-0">
                        <div className="text-[9.5px] font-semibold" style={{ color: c.who === "you" ? T.accent : T.sec }}>{c.name}</div>
                        <div className="text-[11.5px] leading-snug" style={{ color: T.text }}>{c.text}</div>
                      </div>
                    </m.div>
                  ))}
                  {recording && chunksShown < CHUNKS.length && !reduced && (
                    <div className="flex gap-1 pl-7 pt-1">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: T.ter, animationDelay: `${d * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                </div>
                <m.div
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: showSummary ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-start gap-2 border-t px-4 py-3"
                  style={{ borderColor: T.border, background: T.page }}
                >
                  <Sparkles size={13} className="mt-0.5 shrink-0" style={{ color: T.accent }} />
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>Live summary</div>
                    <div className="text-[11px] leading-snug" style={{ color: T.text }}>{SUMMARY}</div>
                  </div>
                </m.div>
              </div>
            </div>

            {/* ── Extracted: action items + buying signals + CRM sync ── */}
            <div className="flex min-h-0 flex-col gap-4 border-l p-5" style={{ borderColor: T.border, background: T.card }}>
              <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: showSignals ? GREEN : T.accent }}>
                {showSignals ? <Check size={13} /> : <Sparkles size={13} className={reduced ? "" : "animate-pulse"} />}
                {showSignals ? "Captured & ready to review" : "Extracting…"}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}><ListChecks size={12} /> Action items</div>
                <div className="space-y-1.5">
                  {ACTIONS.map((a, i) => (
                    <m.div
                      key={i}
                      initial={reduced ? false : { opacity: 0, x: 8 }}
                      animate={showActions ? { opacity: 1, x: 0 } : { opacity: 0 }}
                      transition={{ duration: 0.35, delay: reduced ? 0 : i * 0.12 }}
                      className="flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                      style={{ borderColor: T.border, background: T.page, color: T.text }}
                    >
                      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border" style={{ borderColor: T.ter }} />
                      {a}
                    </m.div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}><TrendingUp size={12} /> Buying signals</div>
                <div className="flex flex-wrap gap-1.5">
                  {SIGNALS.map((s, i) => (
                    <m.span
                      key={i}
                      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                      animate={showSignals ? { opacity: 1, scale: 1 } : { opacity: 0 }}
                      transition={{ duration: 0.35, delay: reduced ? 0 : i * 0.12 }}
                      className="rounded-full px-2 py-1 text-[10px] font-semibold"
                      style={{ background: s.tone === GREEN ? GREEN_SOFT : T.accentSoft, color: s.tone }}
                    >
                      {s.label}
                    </m.span>
                  ))}
                </div>
              </div>

              {/* pinned to the bottom — the whole capture lands in the CRM, no typing */}
              <m.div
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={showSync ? { opacity: 1, y: 0 } : { opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-medium"
                style={{ background: GREEN_SOFT, color: T.text }}
              >
                <Check size={14} style={{ color: GREEN }} />
                Logged to your CRM · no manual entry
              </m.div>
            </div>
          </div>
        </AppFrame>
      </ScaleToFit>
    </div>
  );
}
