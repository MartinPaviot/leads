/**
 * Deal-READ eval scenarios — the LLM-grounded deal-briefing eval the schema-only
 * suite (suites/deal-briefing.eval.ts) explicitly deferred as "a separate cycle".
 *
 * Each scenario is a full synthetic deal timeline (activities with bodies) whose
 * GOLDEN read is DESIGNED IN: the correct risk, whether it's stalled, the facts a
 * competent read must surface (mustCatch — verbatim in the evidence), and things
 * a faithful read must NOT invent (mustNotFabricate). The hard ones probe the
 * STRATEGIC read: a warm tone hiding a stall, a buried objection, a silent ghost.
 *
 * Synthetic only — the repo is PUBLIC, no real prospect content is committed.
 * Founder calibration against real deals is the optional follow-up (10 min).
 */

import type { DealBriefTimelineActivity } from "@/lib/deals/deal-briefing-prompt";

export interface DealReadGolden {
  /** Acceptable riskLevel values for a correct read. */
  expectedRisk: Array<"low" | "medium" | "high" | "critical">;
  /** True → the read MUST populate stallReason (non-null). */
  expectedStalled: boolean;
  /** Synonym GROUPS a competent read must surface — a group passes if the read
   *  contains ANY member (case-insensitive), so LLM phrasing variation is
   *  tolerated. At least one member of each group is verbatim in the timeline
   *  (fixture soundness, checked deterministically without a key). */
  mustCatch: string[][];
  /** Tokens a faithful read must NOT invent (absent from the evidence). */
  mustNotFabricate: string[];
}

export interface DealReadScenario {
  id: string;
  description: string;
  deal: {
    name: string;
    stage: string;
    value: number | null;
    summary: string | null;
    daysInStage: number;
    stallBucket: string;
  };
  companyName: string | null;
  contactName: string | null;
  contactTitle: string | null;
  activities: DealBriefTimelineActivity[];
  golden: DealReadGolden;
}

function email(
  daysAgoISO: string,
  direction: "inbound" | "outbound",
  subject: string,
  body: string,
): DealBriefTimelineActivity {
  return {
    occurredAt: new Date(daysAgoISO),
    channel: "email",
    activityType: direction === "inbound" ? "email_received" : "email_sent",
    direction,
    summary: subject,
    rawContent: body,
    metadata: { subject },
  };
}

export const DEAL_READ_SCENARIOS: DealReadScenario[] = [
  {
    id: "warm-tone-hiding-a-stall",
    description:
      "Every email is friendly, but the buyer quietly gated the deal on procurement and has gone quiet for 25 days.",
    deal: { name: "Northwind — platform rollout", stage: "proposal", value: 60000, summary: null, daysInStage: 25, stallBucket: "stalled" },
    companyName: "Northwind",
    contactName: "Sarah Chen",
    contactTitle: "VP Ops",
    activities: [
      email("2026-05-10", "outbound", "Re: next steps", "Great — really enjoyed the session! Sending the proposal over now, shout if anything's unclear."),
      email("2026-05-11", "inbound", "Re: next steps", "Thanks so much, this looks great and the team is excited. One thing before we can sign: this now has to go through procurement, and they're backed up until end of quarter. I'll chase them."),
      email("2026-05-18", "outbound", "Checking in", "Hi Sarah — just circling back to see if procurement has had a chance to look. Happy to jump on a call with them."),
    ],
    golden: {
      expectedRisk: ["high", "critical"],
      expectedStalled: true,
      mustCatch: [["procurement"]],
      mustNotFabricate: ["signed", "closed won", "contract signed"],
    },
  },
  {
    id: "buried-objection-under-enthusiasm",
    description:
      "Enthusiastic reply that buries a real budget objection from the CFO after two paragraphs of praise.",
    deal: { name: "Bricks — expansion", stage: "negotiation", value: 90000, summary: null, daysInStage: 9, stallBucket: "active" },
    companyName: "Bricks",
    contactName: "Tom Rivera",
    contactTitle: "Head of RevOps",
    activities: [
      email("2026-05-20", "inbound", "Re: proposal", "Honestly this is exactly what we need and the team loved the demo — the automation piece alone would save us days. I want to make this happen. That said, I have to be straight with you: at $90k the CFO thinks it's too expensive for this fiscal year, so I need to figure out the budget before we go further."),
    ],
    golden: {
      expectedRisk: ["medium", "high"],
      expectedStalled: false,
      mustCatch: [["budget", "too expensive", "cfo", "cost", "price"]],
      mustNotFabricate: ["no objections", "ready to sign"],
    },
  },
  {
    id: "clear-go-recent",
    description: "Explicit, recent buying decision — the read should be low risk with a send-contract next step.",
    deal: { name: "Hightide — annual", stage: "negotiation", value: 45000, summary: null, daysInStage: 3, stallBucket: "active" },
    companyName: "Hightide",
    contactName: "Mia Bloom",
    contactTitle: "COO",
    activities: [
      email("2026-05-27", "inbound", "Re: paperwork", "We're good to go — send the order form and we'll countersign this week. Excited to get started."),
    ],
    golden: {
      expectedRisk: ["low", "medium"],
      expectedStalled: false,
      mustCatch: [["order form", "contract", "good to go", "sign"]],
      mustNotFabricate: ["stalled", "lost", "no budget"],
    },
  },
  {
    id: "churn-competitor-chosen",
    description: "The prospect explicitly chose a competitor — a faithful read is critical risk, not a hopeful spin.",
    deal: { name: "Vanta — mid-market", stage: "proposal", value: 70000, summary: null, daysInStage: 12, stallBucket: "active" },
    companyName: "Vanta",
    contactName: "Leo Park",
    contactTitle: "Director of Sales",
    activities: [
      email("2026-05-25", "inbound", "Update", "Appreciate all the time you put in — genuinely. After comparing options we've decided to go with another vendor that already integrates with our billing stack. Not the right fit for us this cycle, but let's stay in touch."),
    ],
    golden: {
      expectedRisk: ["high", "critical"],
      expectedStalled: false,
      mustCatch: [["another vendor", "competitor", "other vendor", "chose"]],
      mustNotFabricate: ["ready to sign", "we're good to go", "healthy"],
    },
  },
  {
    id: "ghosting-after-demo",
    description: "Three unanswered outbound follow-ups over a month — silence, not a stated objection. The read must not invent one.",
    deal: { name: "Cirrus — pilot", stage: "demo", value: 30000, summary: null, daysInStage: 34, stallBucket: "stalled" },
    companyName: "Cirrus",
    contactName: "Dana Wu",
    contactTitle: "Product Lead",
    activities: [
      email("2026-04-24", "outbound", "Thanks for the demo", "Great meeting you today! Recapping the next steps we discussed — I'll send pricing this week and we'll aim for a pilot in May."),
      email("2026-05-05", "outbound", "Pricing + pilot", "Following up with the pricing attached. Let me know if a pilot in the second half of May works."),
      email("2026-05-15", "outbound", "Still keen?", "Hi Dana — haven't heard back, totally understand if priorities shifted. Should I close this out or is there still interest?"),
    ],
    golden: {
      expectedRisk: ["high", "critical"],
      expectedStalled: true,
      mustCatch: [["no response", "haven't heard", "not responded", "no reply", "gone quiet", "unresponsive", "silence", "no answer"]],
      mustNotFabricate: ["too expensive", "chose a competitor", "budget objection"],
    },
  },
  {
    id: "healthy-progressing",
    description: "Recent two-way engagement with a scheduled next meeting and no blockers — genuinely low risk.",
    deal: { name: "Fable — team plan", stage: "demo", value: 24000, summary: null, daysInStage: 4, stallBucket: "active" },
    companyName: "Fable",
    contactName: "Ravi Shah",
    contactTitle: "Eng Manager",
    activities: [
      email("2026-05-26", "outbound", "Re: demo follow-up", "Thanks Ravi — glad the team found it useful. Sharing the security overview you asked for."),
      email("2026-05-27", "inbound", "Re: demo follow-up", "Perfect, security looks fine at a glance. Let's schedule a call next week to loop in the wider team — Tuesday afternoon works for us."),
    ],
    golden: {
      expectedRisk: ["low", "medium"],
      expectedStalled: false,
      mustCatch: [["security", "next week", "tuesday", "scheduled", "schedule a call", "meeting"]],
      mustNotFabricate: ["stalled", "no response", "lost"],
    },
  },
];
