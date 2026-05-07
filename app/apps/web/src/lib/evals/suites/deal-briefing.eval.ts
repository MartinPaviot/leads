/**
 * Eval suite — deal-briefing schema contract.
 *
 * Sprint-3 audit follow-up. The deal-briefing surface produces
 * structured output via `dealBriefSchema`. This suite validates :
 *   1. The schema accepts realistic, well-formed briefs (5 cases).
 *   2. The schema rejects 5 common malformed shapes (missing fields,
 *      wrong enum values, negative health scores).
 *
 * Goal : catch silent prompt or schema drift without burning $ on
 * real LLM calls. When a future PR weakens the schema or introduces
 * a regression in prompt output structure, this suite fails before
 * the change reaches production.
 *
 * Real LLM-grounded eval (golden answers) is out of scope for this
 * suite — that requires a fixture corpus + tenant data and belongs
 * to a separate cycle.
 */

import { dealBriefSchema } from "@/lib/deals/deal-briefing-schema";
import {
  runEvalSuite,
  type EvalSuite,
} from "../harness";

interface Case {
  id: string;
  description: string;
  input: unknown;
  shouldPass: boolean;
}

const VALID_BRIEF = {
  dealId: "deal-1",
  dealName: "Acme — Q2 expansion",
  stage: "Demo",
  value: 50000,
  contactName: "Jane Doe",
  companyName: "Acme Inc",
  daysInStage: 7,
  riskLevel: "medium" as const,
  summary: "Initial demo went well. Sarah surfaced two concerns about pricing and onboarding speed.",
  keyDiscussions: [
    {
      date: "2026-04-12",
      topic: "Pricing pushback on per-seat model",
      source: "meeting" as const,
      verbatimQuote: "We don't have budget for $50K this quarter.",
    },
  ],
  promisesMade: [
    {
      by: "us" as const,
      what: "Provide architecture diagram",
      when: "2026-04-19",
      fulfilled: false,
    },
  ],
  objectionsRaised: [
    {
      objection: "Price too high for our stage",
      status: "open" as const,
      ourResponse: "Proposed annual deal with 20% discount.",
    },
  ],
  stallReason: null,
  nextAction: {
    action: "Send architecture diagram + propose follow-up call",
    owner: "us" as const,
    suggestedDate: "2026-04-19",
  },
  healthScore: 72,
};

const cases: Case[] = [
  // ── Valid (5) ────────────────────────────────────────────
  { id: "valid-baseline", description: "well-formed brief", input: VALID_BRIEF, shouldPass: true },
  {
    id: "valid-stalled",
    description: "stalled deal with stallReason populated",
    input: { ...VALID_BRIEF, riskLevel: "high", stallReason: "Awaiting CFO approval — no contact in 28d" },
    shouldPass: true,
  },
  {
    id: "valid-zero-promises",
    description: "no open promises",
    input: { ...VALID_BRIEF, promisesMade: [] },
    shouldPass: true,
  },
  {
    id: "valid-nullable-fields",
    description: "value + contactName + companyName nullable",
    input: { ...VALID_BRIEF, value: null, contactName: null, companyName: null },
    shouldPass: true,
  },
  {
    id: "valid-multiple-objections",
    description: "multiple objections of different statuses",
    input: {
      ...VALID_BRIEF,
      objectionsRaised: [
        { objection: "Price", status: "addressed" as const, ourResponse: "Discount" },
        { objection: "Timeline", status: "open" as const },
        { objection: "Compliance", status: "resolved" as const, ourResponse: "DPA signed" },
      ],
    },
    shouldPass: true,
  },

  // ── Invalid (5) — common schema drift / regression patterns ─
  {
    id: "invalid-missing-required",
    description: "missing dealId",
    input: { ...VALID_BRIEF, dealId: undefined },
    shouldPass: false,
  },
  {
    id: "invalid-wrong-risk-enum",
    description: "riskLevel enum out of range",
    input: { ...VALID_BRIEF, riskLevel: "extreme" },
    shouldPass: false,
  },
  {
    id: "invalid-source-enum",
    description: "keyDiscussions[].source enum out of range",
    input: {
      ...VALID_BRIEF,
      keyDiscussions: [
        { ...VALID_BRIEF.keyDiscussions[0], source: "telegram" },
      ],
    },
    shouldPass: false,
  },
  {
    id: "invalid-objection-status",
    description: "objectionsRaised[].status enum out of range",
    input: {
      ...VALID_BRIEF,
      objectionsRaised: [
        { objection: "Price", status: "ignored" },
      ],
    },
    shouldPass: false,
  },
  {
    id: "invalid-nextAction-owner",
    description: "nextAction.owner enum out of range",
    input: {
      ...VALID_BRIEF,
      nextAction: { ...VALID_BRIEF.nextAction, owner: "ai" },
    },
    shouldPass: false,
  },
];

export const dealBriefingEvalSuite: EvalSuite<{ ok: boolean }> = {
  surfaceId: "deal-briefing",
  promptId: "deal-briefing-schema.v1",
  cases: cases.map((c) => ({
    id: c.id,
    description: c.description,
    run: async () => {
      const result = dealBriefSchema.safeParse(c.input);
      return { ok: result.success };
    },
    predicate: (out) => out.ok === c.shouldPass,
  })),
  aggregateMetrics: (results) => {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    return {
      pass_rate: total ? passed / total : 0,
      total_cases: total,
      valid_cases: cases.filter((c) => c.shouldPass).length,
      invalid_cases: cases.filter((c) => !c.shouldPass).length,
    };
  },
};

export async function runDealBriefingEval() {
  return runEvalSuite(dealBriefingEvalSuite);
}
