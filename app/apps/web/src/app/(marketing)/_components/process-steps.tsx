"use client";

/**
 * The workflow as a fluid, numbered sequence (Monaco-style): each step names
 * the stage, says in plain words what you can do there, and shows the REAL
 * Elevay surface for it. Visuals alternate left/right down the page so it reads
 * with rhythm, not as a linear stack.
 *
 * Each surface is a `RealShot`: the real product component is rendered at its
 * natural desktop width (1280) and the whole window is SCALED to fit its column
 * (transform — GPU-cheap), clipped to a tasteful height with hidden scrollbars
 * and a soft bottom fade. So the prospect sees the ENTIRE UI at a glance — never
 * a horizontal or vertical scrollbar inside a shot. The cold-call cockpit is the
 * one full-width step (a three-column surface can't read at half width).
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { AppFrame, ScaleToFit } from "./product-mockups";
import { CallModeDemo } from "./call-mode-demo";
import { CampaignsDemo } from "./campaigns-demo";
import { AccountsDemo } from "./accounts-demo";
import { MeetingsDemo } from "./meetings-demo";
import { OpportunitiesDemo } from "./opportunities-demo";

// `h` = the natural content height shown in the shot (before scaling); the rest
// of the page is clipped with a fade, so each shot ends cleanly on a few rows.
const steps: { label: string; headline: string; body: string; Real?: ComponentType; Demo?: ComponentType; Wide?: ComponentType; h?: number; wide?: boolean }[] = [
  {
    label: "Find demand",
    headline: "Your TAM builds and scores itself",
    body: "Describe your ICP once. We scan a live B2B database around the clock and assemble your market — every account graded the moment it lands, the buying triggers behind it in plain view (hiring, fresh funding, shared investors, YC). Fits you'd never spot by hand rise to the top, and the list never goes stale.",
    Demo: AccountsDemo,
  },
  {
    label: "Engage",
    headline: "Outreach written for one, not a list",
    body: "The moment an account heats up, we write a multi-touch sequence from its triggers and your notes — tailored to its real situation, not a first-name merge tag.",
    Demo: CampaignsDemo,
  },
  {
    label: "Engage",
    headline: "Cold calls, fully prepped and logged",
    body: "Your queue is ranked by intent and local time. Before you dial, the brief is already written: who they are, why now, what to open with. While you talk, a live transcript runs. When you hang up, the outcome, the deal and the next tasks land in your CRM without a click.",
    Demo: CallModeDemo,
  },
  {
    label: "Capture",
    headline: "Every meeting, recorded and structured",
    body: "Our notetaker sits in on every call, captures the whole conversation, and drops the action items and intent cues into your CRM before you've even left.",
    Demo: MeetingsDemo,
  },
  {
    label: "Capture",
    headline: "Your CRM fills itself",
    body: "Deal values, fields and stages refresh straight from your calls and emails — your pipeline mirrors reality, with nothing to type.",
    Demo: OpportunitiesDemo,
  },
];

/**
 * The one entrance every surface shares: it fades, lifts and settles into place
 * when it reaches the viewport — once. Strand-proof (a hard timeout forces it
 * visible if the observer ever misfires) and off under reduced-motion.
 */
function RevealOnView({ children, className = "" }: { children: () => React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { margin: "-80px 0px" });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView) setLive(true); }, [inView]);
  useEffect(() => { const t = setTimeout(() => setLive(true), 6000); return () => clearTimeout(t); }, []);
  return (
    <m.div
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22, scale: 0.97 }}
      animate={live ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children()}
    </m.div>
  );
}

/**
 * A real product surface shown as a crisp, fully-visible app window: rendered at
 * its natural desktop width (1280) then scaled to the column, clipped to `h`
 * with hidden scrollbars + a soft bottom fade. Whole UI at a glance, zero
 * scrollbars. Floats on a layered shadow for depth.
 */
function RealShot({ Real, h }: { Real: ComponentType; h: number }) {
  return (
    <RevealOnView>
      {() => (
        <ScaleToFit designWidth={1280}>
          <AppFrame>
            <div className="no-scrollbars relative overflow-hidden" style={{ height: h, background: "var(--color-bg-page)" }}>
              <Real />
              {/* soft fade so the clipped bottom reads as intentional, not cut off */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to bottom, rgba(250,250,250,0), #FAFAFA)" }} />
            </div>
          </AppFrame>
        </ScaleToFit>
      )}
    </RevealOnView>
  );
}

/** Step number + stage label — the badge fills with the accent when its step
 * enters the viewport, so progress reads as you scroll. */
function StepHeading({ i, label, headline, body }: { i: number; label: string; headline: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const inView = useInView(ref, { once: true, margin: "-120px 0px" });
  const [live, setLive] = useState(false);
  useEffect(() => { if (inView || reduced) setLive(true); }, [inView, reduced]);
  useEffect(() => { const t = setTimeout(() => setLive(true), 6000); return () => clearTimeout(t); }, []);

  return (
    <div ref={ref}>
      <div className="flex items-center gap-3">
        <m.span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white text-[13px] font-bold tabular-nums"
          style={{ borderColor: "#E5E7EF", boxShadow: "0 2px 6px rgba(26,26,46,0.06)" }}
          initial={false}
          animate={live ? { scale: [1, 1.12, 1] } : undefined}
          transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
        >
          <m.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: "#2C6BED" }}
            initial={{ scale: 0 }}
            animate={{ scale: live ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          />
          <span className="relative z-[1] transition-colors duration-500" style={{ color: live ? "#fff" : "#2C6BED" }}>{i + 1}</span>
        </m.span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2563DF]">{label}</p>
      </div>
      <m.h3
        className="mt-3 text-[24px] font-bold leading-snug tracking-tight text-gray-900"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={live ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, ease: "easeOut", delay: reduced ? 0 : 0.08 }}
      >
        {headline}
      </m.h3>
      <m.p
        className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={live ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, ease: "easeOut", delay: reduced ? 0 : 0.16 }}
      >
        {body}
      </m.p>
    </div>
  );
}

export function ProcessSteps() {
  // Real surfaces alternate left/right for rhythm; the cold-call cockpit is the
  // single full-width feature (a 3-column cockpit can't read at half width).
  let visualIdx = 0;
  return (
    <div className="space-y-20 md:space-y-28">
      {steps.map((s, i) => {
        if (s.wide) {
          // Full-width feature steps (the live TAM build + the cold-call
          // cockpit) — a data-dense surface can't read at half width.
          const Wide = s.Wide ?? CallModeDemo;
          return (
            <div key={s.headline}>
              <StepHeading i={i} label={s.label} headline={s.headline} body={s.body} />
              {/* Full container width so the surface aligns to the same left AND
                  right margins as every other step (was max-w-[1100px] left-
                  aligned -> a dead gap on the right that broke the rhythm). */}
              <RevealOnView className="mt-8">
                {() => <Wide />}
              </RevealOnView>
            </div>
          );
        }
        const flip = visualIdx % 2 === 1;
        visualIdx += 1;
        const Demo = s.Demo;
        return (
          <div key={s.headline} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
              <StepHeading i={i} label={s.label} headline={s.headline} body={s.body} />
            </div>
            <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
              {Demo ? (
                <RevealOnView>{() => <Demo />}</RevealOnView>
              ) : (
                <RealShot Real={s.Real as ComponentType} h={s.h ?? 620} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
