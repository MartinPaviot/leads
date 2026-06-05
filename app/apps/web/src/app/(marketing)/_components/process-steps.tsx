"use client";

/**
 * The workflow as a fluid, numbered sequence (Monaco-style): each step
 * names the stage, says in plain words what you can do there, and shows
 * the REAL, animated Elevay surface for it — the same faithful product
 * pages from the hero, each replayed when its step scrolls into view.
 * Visuals alternate left/right down the page.
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { AppFrame, ScaleToFit } from "./product-mockups";
import {
  AccountsPhase,
  UpNextPhase,
  CampaignsPhase,
  MeetingsPhase,
  OpportunitiesPhase,
  ChatPhase,
} from "./hero-demo";

type Phase = ComponentType<{ reduced: boolean }>;

const steps: { label: string; headline: string; body: string; Phase: Phase }[] = [
  {
    label: "Find demand",
    headline: "Your target list builds itself",
    body: "Describe your ICP once. Elevay searches a live B2B database, builds your target account list, and scores every account against it, no CSV imports and no manual research.",
    Phase: AccountsPhase,
  },
  {
    label: "Find demand",
    headline: "Open on who is ready now",
    body: "Hiring, funding, tech-stack changes, and replies are detected automatically and surface the warmest accounts at the top, so you open on who is ready.",
    Phase: UpNextPhase,
  },
  {
    label: "Engage",
    headline: "Outreach drafted from real context",
    body: "Email sequences and a live cold-call cockpit with objection coaching mid-call, drafted from each account's signals and notes. Nothing leaves your domain until you approve it.",
    Phase: CampaignsPhase,
  },
  {
    label: "Capture",
    headline: "Every meeting captured for you",
    body: "A bot joins your Meet, Zoom, and Teams calls, transcribes them, and pulls out the action items and buying signals, ready for you to review.",
    Phase: MeetingsPhase,
  },
  {
    label: "Capture",
    headline: "Your CRM fills itself",
    body: "Values update, fields populate, and the next stage is suggested for you, straight from your calls and emails, so the pipeline reflects reality without manual logging.",
    Phase: OpportunitiesPhase,
  },
  {
    label: "Operate",
    headline: "Ask your pipeline anything",
    body: "Query in plain language and get an answer in seconds, each one cited to the exact email or call transcript it came from.",
    Phase: ChatPhase,
  },
];

// Per-phase frame height, sized so each scene fits in one view: no inner
// scroll and no dead band. Accounts (the TAM) is a list, so it stays a touch
// taller and may scroll. Order matches `steps`.
const heights = [540, 412, 444, 490, 318, 228];

/**
 * A faithful product page that fades and settles into place as its step
 * reaches the viewport, then plays its own intro animation once. Each frame is
 * sized to its scene so it fits in one view — no inner scroll, no auto-pan
 * (a long list like the TAM is the one exception). Off under reduced-motion.
 */
function AnimatedSurface({ Phase, h }: { Phase: Phase; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { margin: "-80px 0px" });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView) setLive(true); }, [inView]);
  // Safety net: the fade-in is gated on the observer, so a misfire (fast
  // scroll, restored scroll position, full-page render) could leave a step
  // stranded at opacity 0. Force it visible after a few seconds no matter
  // what, so a surface can never stay invisible.
  useEffect(() => {
    const t = setTimeout(() => setLive(true), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 22, scale: 0.97 }}
      animate={live ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <ScaleToFit designWidth={460}>
        <AppFrame>
          <div style={{ height: h }} className="overflow-hidden bg-[#FAFAFA]">
            {live ? <Phase key="live" reduced={reduced} /> : <Phase key="static" reduced />}
          </div>
        </AppFrame>
      </ScaleToFit>
    </motion.div>
  );
}

export function ProcessSteps() {
  return (
    <div className="space-y-16 md:space-y-24">
      {steps.map((s, i) => {
        const flip = i % 2 === 1;
        return (
          <div key={s.headline} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white text-[13px] font-bold tabular-nums"
                  style={{ borderColor: "#E5E7EF", color: "#2C6BED", boxShadow: "0 2px 6px rgba(26,26,46,0.06)" }}
                >
                  {i + 1}
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2C6BED]">{s.label}</p>
              </div>
              <h3 className="mt-3 text-[24px] font-bold leading-snug tracking-tight text-gray-900">{s.headline}</h3>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">{s.body}</p>
            </div>
            <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
              <AnimatedSurface Phase={s.Phase} h={heights[i]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
