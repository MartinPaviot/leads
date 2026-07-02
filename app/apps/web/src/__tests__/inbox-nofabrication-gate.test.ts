/**
 * C1 gate — inbox-draft NO-FABRICATION of figures. Complements inbox-draft-gate
 * (which catches PRE-LISTED trap facts) by catching NOVEL fabrications: a draft
 * inventing a price/quote/figure the model was never given. Born from a live
 * 2026-06-20 finding — composeReply answered an 8-seat pricing ask with an
 * invented "$4,800/month" (no price anywhere in the thread). A founder could send
 * a wrong quote; this is the cardinal sales-draft sin.
 *
 * DETERMINISTIC floor (always): the unsourcedAmounts detector flags an ungrounded
 * amount + ignores grounded ones / seat counts. LLM TIER (WHERE ANTHROPIC_API_KEY):
 * runs composeReply() on pricing-question threads that contain NO price and asserts
 * it invents none. Wired into eval:run.
 */

import { describe, it, expect } from "vitest";
import { moneyTokens, unsourcedAmounts } from "@/lib/evals/inbox-metrics";
import { composeReply } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY;

describe("unsourcedAmounts — deterministic detector", () => {
  it("flags a money figure in the draft that is absent from the source", () => {
    const source = "What does pricing look like for 8 seats?";
    const draft = "For 8 seats, we're at $4,800/month.";
    expect(unsourcedAmounts(draft, source)).toEqual(["4800"]);
  });

  it("passes when the figure is grounded in the source", () => {
    const source = "Our budget is around $5,000/month for this.";
    const draft = "Understood — $5,000/month works on our end; let's proceed.";
    expect(unsourcedAmounts(draft, source)).toEqual([]);
  });

  it("does not treat seat counts or casual numbers as money", () => {
    expect(moneyTokens("For 8 seats, give us a day or two")).toEqual([]);
  });

  it("normalizes 12k → 12000 and detects the fabrication", () => {
    expect(unsourcedAmounts("we're around 12k a year", "no figures in here")).toEqual(["12000"]);
  });

  // 2026-07-02 audit regression: k-normalization must be SYMMETRIC. A draft
  // echoing the thread's own "$40k" was false-flagged as fabricating "40000"
  // because only the draft side was k-expanded.
  it("a draft echoing the source's own $40k is grounded, in both spellings", () => {
    const source = "at $40k a year we're above what finance planned for this.";
    expect(unsourcedAmounts("I hear you on the $40k constraint.", source)).toEqual([]);
    expect(unsourcedAmounts("I hear you on the $40,000 constraint.", source)).toEqual([]);
    // …and a DIFFERENT invented figure still flags.
    expect(unsourcedAmounts("what if we did $32k instead?", source)).toEqual(["32000"]);
  });
});

// Pricing-question threads with NO price in-thread — a faithful reply must not invent one.
const PRICING_THREADS: Array<{ id: string; source: string; messages: Array<{ direction: string; from: string; body: string }> }> = [
  {
    id: "seats-pricing",
    source: "Thanks for the demo. What does pricing look like for 8 seats? Can we import our HubSpot pipeline? Pilot in early July.",
    messages: [{ direction: "inbound", from: "Sarah Chen <sarah@northwind.io>", body: "Hi,\n\nThanks for the demo — impressed. Two questions: 1) What does pricing look like for 8 seats? 2) Can we import our existing HubSpot pipeline? We'd like a pilot in early July.\n\nSarah" }],
  },
  {
    id: "discount-ask",
    source: "Are there any discounts for annual billing? We're a small team.",
    messages: [{ direction: "inbound", from: "Tom B <tom@hightide.io>", body: "Quick one — do you offer any discount for annual billing? We're a small team and watching budget.\n\nTom" }],
  },
];

describe.skipIf(!HAS_LLM)("no-fabrication — LLM tier (composeReply invents no price)", () => {
  it("invents no money figure on a pricing question with no price in-thread", async () => {
    let fabrications = 0;
    const detail: string[] = [];
    for (const t of PRICING_THREADS) {
      const messages = t.messages.map((m) => ({ ...m, at: null })) as unknown as ThreadMessage[];
      const draft = await composeReply(messages);
      const bad = unsourcedAmounts(draft.text ?? "", t.source);
      if (bad.length) {
        fabrications++;
        detail.push(`${t.id}: invented ${bad.join(",")}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[no-fabrication LLM] fabricated_price_drafts=${fabrications}/${PRICING_THREADS.length} ${detail.join(" | ")} (target 0)`);
    expect(fabrications, detail.join(" | ")).toBe(0);
  });
});
