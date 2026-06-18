"use client";

/**
 * CampaignsDemo — the self-playing "outbound drafted from real context" surface
 * (landing step Engage, _specs/call-lists landing polish). Same spirit as
 * CallModeDemo: a real-looking Elevay surface that PLAYS one short loop while in
 * view, static under prefers-reduced-motion. All animation is opacity/transform
 * plus a small typed-text reveal — no blur, no radial gradients, GPU-safe.
 *
 * The story: Elevay reads one account's real signals, then drafts a multi-touch
 * sequence step by step (the first email types itself, grounded in the signal),
 * and nothing sends until the human approves.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Sparkles, Mail, MessageSquare, Clock, ShieldCheck, Check } from "lucide-react";
import { AppFrame, ScaleToFit, Logo, clogo } from "./product-mockups";

const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const GREEN = "#4E9E86";
const GREEN_SOFT = "rgba(78,158,134,0.13)";

// The account whose real signals ground the draft.
const ACCOUNT = { dom: "mercury.com", name: "Mercury", signal: "Raised Series B · hiring 3 SDRs" };

// The drafted multi-touch sequence. The first email's body types in live.
const STEPS: { icon: typeof Mail; channel: string; day: string; preview: string }[] = [
  { icon: Mail, channel: "Email", day: "Day 0", preview: "" },
  { icon: MessageSquare, channel: "LinkedIn", day: "Day 2", preview: "Quick follow-up on the note I sent — worth 15 min?" },
  { icon: Mail, channel: "Email", day: "Day 5", preview: "Sharing how a peer post-raise cut ramp time for new SDRs." },
];

const EMAIL_SUBJECT = "Scaling outbound after the Series B";
const EMAIL_BODY =
  "Congrats on the raise. With three SDRs joining, the usual crunch is ramp time — list-building and research eat the first months. That's exactly the work Elevay takes off their plate. Worth a short look on Thursday?";

// Cycle timeline (ms from start): each phase reveals one more step; the body
// types during phase 1; the approve state lands at the end; then it loops.
const PHASES = [0, 900, 3400, 4400, 5400, 7200]; // 0 read · 1 email+type · 2 li · 3 email3 · 4 approve · 5 hold
const CYCLE_MS = 9000;

export function CampaignsDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });
  const [phase, setPhase] = useState(reduced ? 4 : 0);
  const [typed, setTyped] = useState(reduced ? EMAIL_BODY.length : 0);
  const [cycle, setCycle] = useState(0);

  // Phase driver: a fresh set of timers each cycle; cleanup wipes them so
  // leaving the viewport mid-draft restarts cleanly on return.
  useEffect(() => {
    if (reduced || !inView) return;
    setPhase(0); setTyped(0);
    const timers = PHASES.map((ms, i) => setTimeout(() => setPhase(i), ms));
    const restart = setTimeout(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(restart); };
  }, [reduced, inView, cycle]);

  // Type the first email body during phase >= 1 (chunked, not per-letter, so it
  // reads like real drafting and stays cheap).
  useEffect(() => {
    if (reduced || phase < 1) return;
    let i = typed;
    const id = setInterval(() => {
      i = Math.min(EMAIL_BODY.length, i + 3);
      setTyped(i);
      if (i >= EMAIL_BODY.length) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase >= 1, reduced]);

  const approved = phase >= 4;
  const stepVisible = (i: number) => phase >= i + 1;

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={1080}>
        <AppFrame url="app.elevay.com/campaigns">
          <div className="grid grid-cols-[300px_1fr]" style={{ height: 470, background: T.page }}>
            {/* ── Left rail: the sequence skeleton being built ── */}
            <div className="flex flex-col gap-3 border-r p-4" style={{ borderColor: T.border, background: T.card }}>
              <div className="flex items-center gap-2">
                <Logo src={clogo(ACCOUNT.dom)} name={ACCOUNT.name} size={28} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-tight" style={{ color: T.text }}>{ACCOUNT.name}</div>
                  <div className="truncate text-[10px]" style={{ color: GREEN }}>{ACCOUNT.signal}</div>
                </div>
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: approved ? GREEN : T.accent }}>
                {approved ? <Check size={13} /> : <Sparkles size={13} className={reduced ? "" : "animate-pulse"} />}
                {approved ? "Sequence ready for review" : "Drafting from signals…"}
              </div>

              <div className="mt-1 flex flex-col gap-2">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <m.div
                      key={i}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={stepVisible(i) ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                      style={{ borderColor: T.border, background: T.page }}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: T.accentSoft, color: T.accent }}>
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold" style={{ color: T.text }}>{s.channel}</div>
                        <div className="flex items-center gap-1 text-[9px]" style={{ color: T.ter }}>
                          <Clock size={8} /> {s.day}
                        </div>
                      </div>
                    </m.div>
                  );
                })}
              </div>
            </div>

            {/* ── Right: the first email drafting itself live ── */}
            <div className="flex flex-col p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>Step 1 · Email · Day 0</div>
              <div className="mt-2 text-[15px] font-semibold" style={{ color: T.text }}>
                {EMAIL_SUBJECT}
                {!reduced && phase < 1 && <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-0.5 animate-pulse" style={{ background: T.accent }} />}
              </div>
              <div className="mt-3 flex-1 rounded-xl border p-4 text-[12.5px] leading-relaxed" style={{ borderColor: T.border, background: T.card, color: T.sec }}>
                Hi Dana,<br />
                <span style={{ color: T.text }}>
                  {reduced ? EMAIL_BODY : EMAIL_BODY.slice(0, typed)}
                  {!reduced && typed < EMAIL_BODY.length && phase >= 1 && (
                    <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-0.5 animate-pulse" style={{ background: T.accent }} />
                  )}
                </span>
              </div>

              {/* Approval gate — the human stays in control. */}
              <div className="mt-4 flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: approved ? GREEN_SOFT : T.border, background: approved ? GREEN_SOFT : T.card }}>
                <div className="flex items-center gap-2 text-[12px]" style={{ color: T.sec }}>
                  <ShieldCheck size={15} style={{ color: approved ? GREEN : T.ter }} />
                  Nothing leaves your domain until you approve.
                </div>
                <m.span
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white"
                  style={{ background: approved ? GREEN : T.accent }}
                  initial={false}
                  animate={!reduced && approved ? { scale: [1, 1.06, 1] } : undefined}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  {approved ? <><Check size={13} /> Approved</> : "Approve & launch"}
                </m.span>
              </div>
            </div>
          </div>
        </AppFrame>
      </ScaleToFit>
    </div>
  );
}
