"use client";

/**
 * ProductShowcase — a pinned horizontal scroll showcase (the "agency" pattern).
 *
 * The trick that makes it read as designed motion, not a slow scroll: the INPUT
 * (vertical scroll, the natural gesture) is decoupled from the MOTION (a
 * horizontal pan). The section is tall; an inner viewport is `sticky` (pinned)
 * while you scroll through it, and scroll progress is mapped to translateX of a
 * track of product panels. Each panel gets its OWN moment — it assembles
 * (fade + scale up) as it reaches centre and dissolves (fade + scale down) as it
 * leaves, so it never reads as a flat conveyor belt.
 *
 * GPU-safety (the hard constraint this codebase has been burned by — see
 * hero-demo.tsx:190 / :212): transform (x, scale) + opacity ONLY. No blur, no
 * clip-path wipe, no large colour overlay — those smear past the clip / into a
 * green band on weak GPUs. A `useSpring` gives the pan its weighty lag instead.
 *
 * Under prefers-reduced-motion (and on no-JS / SSR) it degrades to a plain
 * vertical stack — no pin, no horizontal, every panel simply shown.
 */

import { useRef } from "react";
import {
  m,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { AccountsDemo } from "./accounts-demo";
import { CampaignsDemo } from "./campaigns-demo";
import { CallModeDemo } from "./call-mode-demo";
import { MeetingsDemo } from "./meetings-demo";
import { OpportunitiesDemo } from "./opportunities-demo";

type Panel = {
  key: string;
  label: string;
  headline: string;
  body: string;
  Demo: React.ComponentType;
};

const PANELS: Panel[] = [
  {
    key: "find",
    label: "Find demand",
    headline: "Your TAM builds and scores itself",
    body: "Describe your ICP once. We assemble your market around the clock and grade every account the moment it lands — the best-fit ones rise to the top.",
    Demo: AccountsDemo,
  },
  {
    key: "engage-write",
    label: "Engage",
    headline: "Outreach written for one, not a list",
    body: "The moment an account heats up, we write a multi-touch sequence from its real triggers and your notes — not a first-name merge tag.",
    Demo: CampaignsDemo,
  },
  {
    key: "engage-call",
    label: "Engage",
    headline: "Cold calls, fully prepped and logged",
    body: "Your queue is ranked by intent and local time. The brief is written before you dial; the outcome, deal and next tasks land in your CRM without a click.",
    Demo: CallModeDemo,
  },
  {
    key: "capture-meet",
    label: "Capture",
    headline: "Every meeting, recorded and structured",
    body: "Our notetaker sits in on every call, captures the whole conversation, and drops the action items and intent cues into your CRM before you've left.",
    Demo: MeetingsDemo,
  },
  {
    key: "capture-crm",
    label: "Capture",
    headline: "Your CRM fills itself",
    body: "Deal values, fields and stages refresh straight from your calls and emails. Your pipeline mirrors reality, with nothing to type.",
    Demo: OpportunitiesDemo,
  },
];

const N = PANELS.length;
const PANEL_VW = 80; // each panel is 80vw → ~10vw of each neighbour peeks in

// translateX (in vw, as a number) that brings panel i to the viewport centre.
const centreFor = (i: number) => 50 - (i * PANEL_VW + PANEL_VW / 2);

/* ── one panel: emphasised at its centre, dimmed + shrunk off-centre ── */

function ShowcasePanel({
  panel,
  index,
  progress,
}: {
  panel: Panel;
  index: number;
  progress: MotionValue<number>;
}) {
  // The progress value at which THIS panel sits dead centre.
  const centre = N > 1 ? index / (N - 1) : 0;
  const span = 1 / (N - 1 || 1);
  const range = [centre - span, centre, centre + span];

  const opacity = useTransform(progress, range, [0.25, 1, 0.25], { clamp: true });
  const scale = useTransform(progress, range, [0.9, 1, 0.9], { clamp: true });

  const { Demo } = panel;

  return (
    <m.div
      className="flex h-full shrink-0 flex-col items-center justify-center px-[2vw]"
      style={{ width: `${PANEL_VW}vw`, opacity, scale }}
    >
      <div className="w-full max-w-[900px]">
        <div className="mb-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2563DF]">
            {String(index + 1).padStart(2, "0")} · {panel.label}
          </p>
          <h3 className="mt-2 text-[24px] font-bold leading-snug tracking-tight text-gray-900 sm:text-[30px]">
            {panel.headline}
          </h3>
          <p className="mx-auto mt-3 max-w-[620px] text-[15px] leading-relaxed text-gray-600">
            {panel.body}
          </p>
        </div>
        <Demo />
      </div>
    </m.div>
  );
}

/* ── progress dots ── */

function ProgressDot({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const centre = N > 1 ? index / (N - 1) : 0;
  const span = 1 / (N - 1 || 1);
  const w = useTransform(progress, [centre - span / 2, centre, centre + span / 2], [6, 22, 6], { clamp: true });
  const bg = useTransform(
    progress,
    [centre - span / 2, centre, centre + span / 2],
    ["#D9DCE4", "#2C6BED", "#D9DCE4"],
    { clamp: true },
  );
  return <m.span className="h-1.5 rounded-full" style={{ width: w, background: bg }} />;
}

/* ── reduced-motion / fallback: a plain vertical stack ── */

function StackedFallback() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-24 px-6 py-24">
      {PANELS.map((panel, i) => {
        const { Demo } = panel;
        return (
          <div key={panel.key}>
            <div className="mb-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2563DF]">
                {String(i + 1).padStart(2, "0")} · {panel.label}
              </p>
              <h3 className="mt-2 text-[24px] font-bold leading-snug tracking-tight text-gray-900 sm:text-[30px]">
                {panel.headline}
              </h3>
              <p className="mx-auto mt-3 max-w-[620px] text-[15px] leading-relaxed text-gray-600">{panel.body}</p>
            </div>
            <div className="mx-auto max-w-[900px]">
              <Demo />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── the showcase ── */

export function ProductShowcase() {
  const reduced = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);

  // 0 when the section's top reaches the viewport top (pin begins), 1 when its
  // bottom reaches the viewport bottom (pin ends).
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Map scroll progress → horizontal pan (vw, numeric), spring it for weighty
  // lag, then re-attach the unit. Spring on a NUMBER, never a unit-string.
  const xNum = useTransform(scrollYProgress, [0, 1], [centreFor(0), centreFor(N - 1)]);
  const xSpring = useSpring(xNum, { stiffness: 90, damping: 26, mass: 0.6 });
  const x = useMotionTemplate`${xSpring}vw`;

  if (reduced) {
    return (
      <section aria-label="Product showcase">
        <StackedFallback />
      </section>
    );
  }

  return (
    // Tall section gives the pin its scroll distance (~1 viewport per panel).
    <section
      ref={sectionRef}
      aria-label="Product showcase"
      style={{ height: `${N * 100}vh` }}
      className="relative"
    >
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden bg-white">
        {/* track */}
        <div className="relative flex min-h-0 flex-1 items-center">
          <m.div className="flex h-full items-center" style={{ x }}>
            {PANELS.map((panel, i) => (
              <ShowcasePanel key={panel.key} panel={panel} index={i} progress={scrollYProgress} />
            ))}
          </m.div>
        </div>
        {/* progress rail */}
        <div className="flex shrink-0 items-center justify-center gap-2 pb-10 pt-2">
          {PANELS.map((_, i) => (
            <ProgressDot key={i} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </section>
  );
}
