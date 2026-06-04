"use client";

/**
 * The workflow as a fluid, numbered sequence (Monaco-style): each step
 * names the stage, says in plain words what you can do there, and shows
 * the real Elevay surface for it. Connected by a vertical spine so it
 * reads as one continuous flow from cold list to closed deal.
 *
 * Static by design (no scroll-gated reveal) so a step can never strand at
 * opacity:0 — the parent Section already does a gentle mount fade.
 */

import {
  TamMock,
  SignalsMock,
  OutreachMock,
  MeetingMock,
  OppMock,
  ChatMock,
} from "./product-mockups";

const steps: { label: string; headline: string; body: string; visual: React.ReactNode }[] = [
  {
    label: "Find demand",
    headline: "Your target list builds itself",
    body: "Describe your ICP once. Elevay searches live B2B databases, scores every account against it, and enriches verified decision-makers, no CSV imports and no manual research.",
    visual: <TamMock />,
  },
  {
    label: "Find demand",
    headline: "Open on who is ready now",
    body: "Hiring, funding, tech-stack changes, pricing-page visits, and replies reorder your list in real time, so the warmest account is always at the top.",
    visual: <SignalsMock />,
  },
  {
    label: "Engage",
    headline: "Outreach drafted from real context",
    body: "Email sequences and a cold-call cockpit, written from each account's signals and your past calls. Nothing leaves your domain until you approve it.",
    visual: <OutreachMock />,
  },
  {
    label: "Capture",
    headline: "Every meeting captured for you",
    body: "A bot joins your Meet, Zoom, and Teams calls, transcribes them, and pulls out the action items and buying signals, ready for you to review.",
    visual: <MeetingMock />,
  },
  {
    label: "Capture",
    headline: "Your CRM fills itself",
    body: "Deals advance stages, values update, and fields populate straight from your calls and emails, so the pipeline reflects reality without manual logging.",
    visual: <OppMock />,
  },
  {
    label: "Operate",
    headline: "Ask your pipeline anything",
    body: "Query in plain language and get an answer in seconds, each one cited to the exact email or call transcript it came from.",
    visual: <ChatMock />,
  },
];

export function ProcessSteps() {
  return (
    <div className="relative">
      {/* vertical spine connecting the numbered steps */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-8 left-[18px] top-8 hidden w-px md:block"
        style={{ background: "linear-gradient(180deg, transparent, #E5E7EF 6%, #E5E7EF 94%, transparent)" }}
      />
      <div className="space-y-14 md:space-y-[72px]">
        {steps.map((s, i) => (
          <div key={s.headline} className="relative md:pl-16">
            <div
              className="absolute left-0 top-0 z-10 hidden h-9 w-9 items-center justify-center rounded-full border bg-white text-[14px] font-bold tabular-nums md:flex"
              style={{ borderColor: "#E5E7EF", color: "#2C6BED", boxShadow: "0 2px 6px rgba(26,26,46,0.06)" }}
            >
              {i + 1}
            </div>
            <div className="grid items-center gap-7 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2C6BED]">
                  {i + 1}. {s.label}
                </p>
                <h3 className="mt-2 text-[22px] font-bold leading-snug tracking-tight text-gray-900">{s.headline}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">{s.body}</p>
              </div>
              <div>{s.visual}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
