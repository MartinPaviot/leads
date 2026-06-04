"use client";

/**
 * The workflow as a fluid, numbered sequence (Monaco-style): each step
 * names the stage, says in plain words what you can do there, and shows
 * the REAL, animated Elevay surface for it — the same faithful product
 * pages from the hero, each replayed when its step scrolls into view.
 * Visuals alternate left/right down the page.
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { AppFrame } from "./product-mockups";
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
    body: "Describe your ICP once. Elevay searches live B2B databases, scores every account against it, and enriches verified decision-makers, no CSV imports and no manual research.",
    Phase: AccountsPhase,
  },
  {
    label: "Find demand",
    headline: "Open on who is ready now",
    body: "Hiring, funding, tech-stack changes, pricing-page visits, and replies reorder your list in real time, so the warmest account is always at the top.",
    Phase: UpNextPhase,
  },
  {
    label: "Engage",
    headline: "Outreach drafted from real context",
    body: "Email sequences and a cold-call cockpit, written from each account's signals and your past calls. Nothing leaves your domain until you approve it.",
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
    body: "Deals advance stages, values update, and fields populate straight from your calls and emails, so the pipeline reflects reality without manual logging.",
    Phase: OpportunitiesPhase,
  },
  {
    label: "Operate",
    headline: "Ask your pipeline anything",
    body: "Query in plain language and get an answer in seconds, each one cited to the exact email or call transcript it came from.",
    Phase: ChatPhase,
  },
];

/** Renders a faithful product page and replays its animation on scroll-in. */
function AnimatedSurface({ Phase }: { Phase: Phase }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { margin: "-90px 0px" });
  const [playKey, setPlayKey] = useState(0);
  useEffect(() => {
    if (inView && !reduced) setPlayKey((k) => k + 1);
  }, [inView, reduced]);
  return (
    <div ref={ref}>
      <AppFrame>
        <div style={{ height: 374 }} className="overflow-hidden bg-[#FAFAFA]">
          <Phase key={playKey} reduced={reduced} />
        </div>
      </AppFrame>
    </div>
  );
}

export function ProcessSteps() {
  return (
    <div className="space-y-16 md:space-y-24">
      {steps.map((s, i) => {
        const flip = i % 2 === 1;
        return (
          <div key={s.headline} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={flip ? "lg:order-2" : ""}>
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
            <div className={flip ? "lg:order-1" : ""}>
              <AnimatedSurface Phase={s.Phase} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
