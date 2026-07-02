/**
 * Inbox-reply OBJECTION-HANDLING gate. Complements the fabrication gates
 * (inbox-draft / inbox-nofabrication) with the OTHER cardinal sales-draft sin:
 * a warm, fluent reply that quietly IGNORES an open objection the buyer already
 * raised — a pleasant non-answer, one founder click from being sent.
 *
 * The open objections ARE surfaced into the prompt (reply-context.ts:23 →
 * compose-reply.ts:57, "What you know about them: …"), but until now the task
 * sentence treated them as FYI, never as a MUST-HANDLE constraint. This gate
 * locks in the directive.
 *
 * DETERMINISTIC floor (always, keyless CI): for every scenario, buildReplyPrompt
 * carries BOTH the verbatim objection AND the must-handle directive — so the
 * wiring can't silently rot. LLM tier (skipIf no key): composeReply on a warm
 * thread whose context lists an open objection must SURFACE that objection's
 * lexical field in the draft (recall), not deflect it with warmth. Wired into
 * eval:run. Synthetic only — the repo is PUBLIC, no real prospect content.
 */

import { describe, it, expect } from "vitest";
import { buildReplyPrompt, composeReply } from "@/lib/inbox/compose-reply";
import { unsourcedAmounts } from "@/lib/evals/inbox-metrics";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY;

/** A warm inbound message that, on tone alone, invites a frictionless "great, let's go!". */
function warmThread(from: string, body: string): ThreadMessage[] {
  return [{ direction: "inbound", from, body, at: null }] as unknown as ThreadMessage[];
}

interface ObjectionScenario {
  id: string;
  from: string;
  warmBody: string;
  /** The exact "Open objections to address: …" brief (as reply-context.ts builds it). */
  context: string;
  /** The objection's lexical field — a correct reply surfaces ANY of these. */
  lexis: string[];
}

const SCENARIOS: ObjectionScenario[] = [
  {
    id: "seat-pricing",
    from: "Sarah Chen <sarah@northwind.io>",
    warmBody: "This looks great and the team is genuinely excited — really enjoyed the session. Keen to keep things moving!",
    context: "Open deal stage: proposal. Open objections to address: seat pricing is too high for this year's budget.",
    lexis: ["price", "pricing", "cost", "seat", "budget", "$"],
  },
  {
    id: "security-review",
    from: "Raj Patel <raj@bricks.co>",
    warmBody: "Loved the demo, thank you! Excited about where this could go for us.",
    context: "Open deal stage: negotiation. Open objections to address: we can't sign until this passes our SOC 2 / security review.",
    lexis: ["security", "soc 2", "soc2", "compliance", "review", "audit", "sign"],
  },
  {
    id: "contract-term",
    from: "Mia Bloom <mia@hightide.io>",
    warmBody: "Really appreciate all your time on this — great conversation as always.",
    context: "Open deal stage: negotiation. Open objections to address: not comfortable committing to an annual contract, wants monthly.",
    lexis: ["annual", "monthly", "contract", "commit", "term", "month"],
  },
  {
    id: "competitor",
    from: "Leo Park <leo@vanta.io>",
    warmBody: "Thanks so much, this was helpful and I enjoyed the chat!",
    context: "Open deal stage: proposal. Open objections to address: already evaluating Outreach and currently leaning that way.",
    lexis: ["outreach", "competitor", "alternative", "compare", "comparison", "evaluating", "vendor", "versus", " vs"],
  },
];

const mentionsAny = (text: string, terms: string[]): boolean => {
  const hay = text.toLowerCase();
  return terms.some((t) => hay.includes(t.toLowerCase()));
};

describe("inbox-objection gate — the prompt carries the objection + the must-handle directive (keyless)", () => {
  it("every scenario's prompt includes its verbatim objection and the address-each directive", () => {
    for (const s of SCENARIOS) {
      const prompt = buildReplyPrompt(warmThread(s.from, s.warmBody), { context: s.context });
      // The objection text itself reached the model...
      expect(prompt, `${s.id}: objection missing from prompt`).toContain(s.context);
      // ...AND the task sentence elevates open objections to must-handle.
      expect(prompt.toLowerCase(), `${s.id}: no must-handle directive`).toContain("open objections");
      expect(prompt.toLowerCase(), `${s.id}: directive is not imperative`).toContain("address each one directly");
    }
  });

  it("nudge mode does NOT carry the objection directive (only 'reply' handles objections)", () => {
    const prompt = buildReplyPrompt(warmThread(SCENARIOS[0].from, SCENARIOS[0].warmBody), {
      context: SCENARIOS[0].context,
      mode: "nudge",
    });
    expect(prompt.toLowerCase()).not.toContain("address each one directly");
  });
});

describe.skipIf(!HAS_LLM)("inbox-objection gate — the draft SURFACES the objection, not a warm deflection (LLM tier)", () => {
  it(
    "surfaces the open objection's lexical field in ≥3/4 warm-tone scenarios, inventing no figure",
    async () => {
      let surfaced = 0;
      const detail: string[] = [];
      const fabricated: string[] = [];
      const byId: Record<string, boolean> = {};
      for (const s of SCENARIOS) {
        const draft = await composeReply(warmThread(s.from, s.warmBody), { context: s.context });
        const hit = mentionsAny(draft.text ?? "", s.lexis);
        byId[s.id] = hit;
        if (hit) surfaced++;
        else detail.push(`${s.id}: deflected (no ${s.lexis.slice(0, 3).join("/")})`);
        // The directive pushes the model to COUNTER the objection — counter-
        // pressure must not become invented ROI numbers or discounts (2026-07-02
        // audit: this exact interaction was unmeasured).
        const bad = unsourcedAmounts(draft.text ?? "", `${s.warmBody}\n${s.context}`);
        if (bad.length) fabricated.push(`${s.id}: invented ${bad.join(",")}`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[inbox-objection] surfaced ${surfaced}/${SCENARIOS.length}` +
          (detail.length ? ` — ${detail.join(" | ")}` : " (all addressed)") +
          (fabricated.length ? ` — FABRICATED: ${fabricated.join(" | ")}` : ""),
      );
      // Aggregate floor tolerates ONE stochastic flip.
      expect(surfaced, detail.join(" | ")).toBeGreaterThanOrEqual(3);
      // The canonical warm-tone-hides-a-pricing-stall case must never regress.
      expect(byId["seat-pricing"], "seat-pricing objection was deflected").toBe(true);
      // Countering an objection must never invent a money figure (target 0).
      expect(fabricated, fabricated.join(" | ")).toEqual([]);
    },
    120_000,
  );
});
