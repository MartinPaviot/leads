/**
 * Deal-signal recall gate — does the body excerpt the brain feeds the deal AI
 * PRESERVE the buyer's decision (go / objection / next-step / churn), even when
 * it's buried mid-thread?
 *
 * This is the quality question behind the "email body into the deal AI" work
 * (PR #586 + the decision-aware excerpt). Claap's pitch is "the AI is blind on
 * the most critical part of the deal"; the concrete failure mode on our side is
 * head-truncation losing a "go" that sits after a paragraph of pleasantries.
 *
 * DETERMINISTIC floor (always, free, CI): every golden case's decision signal
 * must survive the ACTUAL brain excerpt. A paired regression test shows the old
 * head-only excerpt loses the buried ones — so the gate has teeth.
 * LLM tier (WHERE ANTHROPIC_API_KEY): feed ONLY the excerpt (what the model
 * actually gets) to a judge and confirm the decision is still readable.
 * Wired into eval:run.
 */

import { describe, it, expect } from "vitest";
import {
  DEAL_SIGNAL_CASES,
  signalInProjection,
  type DealSignalKind,
} from "@/lib/evals/deal-signal";
import { activityExcerpt, decisionAwareExcerpt } from "@/lib/company-brain/excerpt";

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY;

// Model the real brain pipeline: get-brain SELECTs left(rawContent, 2000) and
// maps it through decisionAwareExcerpt. The head-only baseline models the OLD
// pipeline (left(rawContent, 300) → activityExcerpt).
const DB_WINDOW = 2000;
const OLD_DB_WINDOW = 300;
const project = (body: string) => decisionAwareExcerpt(body.slice(0, DB_WINDOW));
const projectHead = (body: string) => activityExcerpt(body.slice(0, OLD_DB_WINDOW));

describe("deal-signal recall — decision-aware excerpt preserves the buyer's decision", () => {
  it("recalls the decision signal for EVERY golden case (head + buried, EN + FR)", () => {
    const missed = DEAL_SIGNAL_CASES.filter(
      (c) => !signalInProjection(project(c.body), c.signal),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[deal-signal] recall=${DEAL_SIGNAL_CASES.length - missed.length}/${DEAL_SIGNAL_CASES.length}` +
        (missed.length ? ` missed=${missed.map((m) => `${m.id}("${m.signal}")`).join(" | ")}` : " (all recalled)"),
    );
    expect(missed.map((m) => m.id)).toEqual([]);
  });

  it("proves the gate has teeth: the OLD head-only excerpt loses buried signals", () => {
    const buried = DEAL_SIGNAL_CASES.filter((c) => c.position === "buried");
    const headMissed = buried.filter(
      (c) => !signalInProjection(projectHead(c.body), c.signal),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[deal-signal] head-only lost ${headMissed.length}/${buried.length} buried signals (that decision-aware recovers)`,
    );
    // If head-only recalled everything, the buried cases aren't actually buried
    // and this eval would be vacuous — assert the failure mode is real.
    expect(headMissed.length).toBeGreaterThan(0);
  });

  it("does not regress head-positioned signals (byte-identical to the head cap)", () => {
    for (const c of DEAL_SIGNAL_CASES.filter((c) => c.position === "head")) {
      expect(decisionAwareExcerpt(c.body)).toBe(activityExcerpt(c.body));
    }
  });
});

// ── LLM tier: is the excerpt SUFFICIENT for the model to read the decision? ──
const KIND_TO_LABEL: Record<DealSignalKind, string> = {
  go: "GO",
  objection: "OBJECTION",
  "next-step": "NEXT_STEP",
  churn: "CHURN",
};

async function judgeDecision(excerpt: string): Promise<string | null> {
  try {
    const { generateText } = await import("ai");
    const { getModelForTask } = await import("@/lib/ai/ai-provider");
    const model = getModelForTask("lightweight");
    if (!model) return null;
    const res = await generateText({
      model: model as unknown as Parameters<typeof generateText>[0]["model"],
      maxOutputTokens: 8,
      prompt: `A prospect's inbound email was compressed to this excerpt. What did the buyer signal about the deal? Answer with EXACTLY one token: GO, OBJECTION, NEXT_STEP, CHURN, or NONE.

EXCERPT:
${excerpt}

Answer:`,
    });
    return res.text.trim().toUpperCase().replace(/[^A-Z_]/g, "") || null;
  } catch {
    return null;
  }
}

describe.skipIf(!HAS_LLM)("deal-signal recall — LLM tier (excerpt is enough to read the decision)", () => {
  it("the judge reads the correct decision from the excerpt alone for ≥80% of cases", async () => {
    let correct = 0;
    const detail: string[] = [];
    for (const c of DEAL_SIGNAL_CASES) {
      const excerpt = project(c.body) ?? "";
      const verdict = await judgeDecision(excerpt);
      const want = KIND_TO_LABEL[c.kind];
      if (verdict === want) correct++;
      else detail.push(`${c.id}: got ${verdict} want ${want}`);
    }
    const rate = correct / DEAL_SIGNAL_CASES.length;
    // eslint-disable-next-line no-console
    console.log(
      `[deal-signal LLM] read ${correct}/${DEAL_SIGNAL_CASES.length} (${(rate * 100).toFixed(0)}%) ${detail.join(" | ")}`,
    );
    expect(rate, detail.join(" | ")).toBeGreaterThanOrEqual(0.8);
  });
});
