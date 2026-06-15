"use client";

/**
 * The workflow as a fluid, numbered sequence (Monaco-style): each step
 * names the stage, says in plain words what you can do there, and shows
 * the REAL, animated Elevay surface for it — the same faithful product
 * pages from the hero, each replayed when its step scrolls into view.
 * Visuals alternate left/right down the page; the cold-call cockpit is
 * the one full-width step (a three-column surface can't read at half
 * width).
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { AppFrame, ScaleToFit } from "./product-mockups";
import { CallModeDemo } from "./call-mode-demo";
import { RealUpNext, RealAccounts, RealOpportunities, RealChat, RealCampaigns, RealMeetings } from "./real-surfaces";

type Phase = ComponentType<{ reduced: boolean }>;

const steps: { label: string; headline: string; body: string; Phase?: Phase; Real?: ComponentType; h?: number; wide?: boolean }[] = [
  {
    label: "Find demand",
    headline: "Your target list builds itself",
    body: "Describe your ICP once. Elevay searches a live B2B database, builds your target account list, and scores every account against it, no CSV imports and no manual research.",
    Real: RealAccounts,
    h: 540,
    wide: true,
  },
  {
    label: "Find demand",
    headline: "Open on who is ready now",
    body: "Replies, opens, booked meetings, and deal moves land in one morning briefing, next to the short list of what genuinely needs a human. You open the day knowing exactly where to spend it.",
    Real: RealUpNext,
    h: 360,
    wide: true,
  },
  {
    label: "Engage",
    headline: "Outreach drafted from real context",
    body: "Multi-touch sequences drafted from each account's signals and notes, never from a template with a first name in it. Nothing leaves your domain until you approve it.",
    Real: RealCampaigns,
    h: 460,
    wide: true,
  },
  {
    label: "Engage",
    headline: "A cold-call cockpit that preps you",
    body: "Today's queue is prioritized by signals and local time. Before you dial: who they are, why now, and what to open with. While you talk: a live transcript. When you hang up: the outcome, the deal, and the follow-up tasks log themselves.",
    wide: true,
  },
  {
    label: "Capture",
    headline: "Every meeting captured for you",
    body: "A bot joins your Meet, Zoom, and Teams calls, transcribes them, and pulls out the action items and buying signals, ready for you to review.",
    Real: RealMeetings,
    h: 520,
    wide: true,
  },
  {
    label: "Capture",
    headline: "Your CRM fills itself",
    body: "Values update, fields populate, and the next stage is suggested for you, straight from your calls and emails, so the pipeline reflects reality without manual logging.",
    Real: RealOpportunities,
    h: 520,
    wide: true,
  },
  {
    label: "Operate",
    headline: "Ask your pipeline anything",
    body: "Query in plain language and get an answer in seconds, each one cited to the exact call, email, or knowledge entry it came from.",
    Real: RealChat,
    h: 420,
    wide: true,
  },
];

/**
 * The one entrance every product surface shares: it fades, lifts, and settles
 * (scale 0.97 -> 1) into place when it reaches the viewport — once. Strand-proof
 * like the page sections (a hard timeout forces it visible if the observer ever
 * misfires) and off under reduced-motion. Exposes `live` via render-prop so the
 * surface can also start its own scripted animation the moment it settles.
 *
 * Used by BOTH the half-width Phase surfaces (AnimatedSurface) and the
 * full-width Call Mode cockpit, so every step enters identically — no surface
 * "just appears" while its neighbours glide in.
 */
function RevealOnView({ children, className = "" }: { children: (live: boolean, reduced: boolean) => React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { margin: "-80px 0px" });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView) setLive(true); }, [inView]);
  useEffect(() => {
    const t = setTimeout(() => setLive(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22, scale: 0.97 }}
      animate={live ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children(live, reduced)}
    </motion.div>
  );
}

/**
 * A faithful product page that fades and settles into place as its step
 * reaches the viewport, then plays its own intro animation once. Each frame is
 * sized to its scene so it fits in one view — no inner scroll, no auto-pan
 * (a long list like the TAM is the one exception).
 */
function AnimatedSurface({ Phase, h }: { Phase: Phase; h: number }) {
  return (
    <RevealOnView>
      {(live, reduced) => (
        <ScaleToFit designWidth={460}>
          <AppFrame>
            <div style={{ height: h }} className="overflow-hidden bg-[#FAFAFA]">
              {live ? <Phase key="live" reduced={reduced} /> : <Phase key="static" reduced />}
            </div>
          </AppFrame>
        </ScaleToFit>
      )}
    </RevealOnView>
  );
}

/** Step number + stage label — the badge fills with the accent when its step
 * enters the viewport, so progress reads as you scroll. */
function StepHeading({ i, label, headline, body, centered }: { i: number; label: string; headline: string; body: string; centered?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { once: true, margin: "-120px 0px" });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView || reduced) setLive(true); }, [inView, reduced]);
  useEffect(() => { const t = setTimeout(() => setLive(true), 6000); return () => clearTimeout(t); }, []);

  return (
    <div ref={ref} className={centered ? "mx-auto max-w-2xl text-center" : ""}>
      <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
        <motion.span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white text-[13px] font-bold tabular-nums"
          style={{ borderColor: "#E5E7EF", boxShadow: "0 2px 6px rgba(26,26,46,0.06)" }}
          initial={false}
          animate={live ? { scale: [1, 1.12, 1] } : undefined}
          transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
        >
          {/* The fill — a disc scaling up behind the number (transform only,
              and it never exceeds the badge's own clip) */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: "#2C6BED" }}
            initial={{ scale: 0 }}
            animate={{ scale: live ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          />
          <span className="relative z-[1] transition-colors duration-500" style={{ color: live ? "#fff" : "#2C6BED" }}>{i + 1}</span>
        </motion.span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2C6BED]">{label}</p>
      </div>
      <motion.h3
        className="mt-3 text-[24px] font-bold leading-snug tracking-tight text-gray-900"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={live ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, ease: "easeOut", delay: reduced ? 0 : 0.08 }}
      >
        {headline}
      </motion.h3>
      <motion.p
        className={`mt-3 text-[15px] leading-relaxed text-gray-600 ${centered ? "" : "max-w-md"}`}
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={live ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, ease: "easeOut", delay: reduced ? 0 : 0.16 }}
      >
        {body}
      </motion.p>
    </div>
  );
}

export function ProcessSteps() {
  // Numbering skips nothing: the wide cockpit step keeps its place in the
  // sequence, it just spans full width (a 3-column cockpit can't read at half
  // width). Its heading is left-aligned and its frame fades-and-settles in on
  // the SAME entrance as every other surface — so it's a member of the
  // sequence, not an outlier.
  let visualIdx = 0;
  return (
    <div className="space-y-16 md:space-y-24">
      {steps.map((s, i) => {
        if (s.wide) {
          // The heading shares the same left edge (x) as every other step
          // heading (no inset); the cockpit is left-aligned right under it at
          // its natural ~1100px width (wider gets sparse in the centre). A
          // deliberate full-width feature, anchored to the column — not a
          // centred outlier.
          return (
            <div key={s.headline}>
              <StepHeading i={i} label={s.label} headline={s.headline} body={s.body} />
              <RevealOnView className="mt-8 max-w-[1100px]">
                {(live, reduced) => {
                  const Real = s.Real;
                  const P = s.Phase;
                  if (Real) return (
                    <ScaleToFit designWidth={1100}>
                      <AppFrame>
                        <div style={{ height: s.h ?? 520 }} className="overflow-hidden">
                          <Real />
                        </div>
                      </AppFrame>
                    </ScaleToFit>
                  );
                  return P ? (
                    <ScaleToFit designWidth={1100}>
                      <AppFrame>
                        <div style={{ height: s.h ?? 520 }} className="overflow-hidden bg-[#FAFAFA]">
                          {live ? <P key="live" reduced={reduced} /> : <P key="static" reduced />}
                        </div>
                      </AppFrame>
                    </ScaleToFit>
                  ) : (
                    <CallModeDemo />
                  );
                }}
              </RevealOnView>
            </div>
          );
        }
        const flip = visualIdx % 2 === 1;
        visualIdx += 1;
        const Phase = s.Phase as Phase;
        return (
          <div key={s.headline} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
              <StepHeading i={i} label={s.label} headline={s.headline} body={s.body} />
            </div>
            <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
              <AnimatedSurface Phase={Phase} h={s.h ?? 400} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
