/**
 * C1 gate — inbox reply-worthy SELECTIVITY floor (locks B1 R3 / R7.1).
 *
 * Deterministic, no LLM: runs the pure isReplyWorthy resolver over the
 * hand-labeled golden fixture and asserts precision/recall >= 0.90 for the
 * draft OFFER (the QUALITY-BENCH section-1 bar). Recall is the load-bearing
 * one — a false NOT-worthy on real human mail is the cardinal sin. Also guards
 * fixture integrity (unique ids, valid taxonomy, boolean labels) so a malformed
 * golden line fails fast rather than mid-run.
 *
 * Wired into `pnpm eval:run`. The remaining C1 surfaces (draft prose, refine,
 * triage, summary, ask) are a separate C1 deliverable; this is the offline
 * selectivity floor B1 depends on.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isReplyWorthy } from "@/lib/inbox/reply-worthy";
import { GENERAL_INTENTS, type GeneralIntent } from "@/lib/inbox/general-intent";
import { replyWorthyPR, type ReplyWorthyEvalCase } from "@/lib/evals/inbox-metrics";

interface GoldenLine {
  id: string;
  scenario: string;
  input: { isMachineSent: boolean; generalIntent: GeneralIntent | null; isBulk: boolean };
  expected: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "lib", "evals", "fixtures", "inbox", "inbox-reply-worthy.golden.jsonl");

function loadGolden(): GoldenLine[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as GoldenLine);
}

const VALID_INTENTS = new Set<string>(GENERAL_INTENTS as readonly string[]);

describe("inbox reply-worthy golden — fixture integrity", () => {
  const golden = loadGolden();

  it("has >= 30 hand-labeled cases (C1 design: inbox-reply-worthy.golden >= 30)", () => {
    expect(golden.length).toBeGreaterThanOrEqual(30);
  });

  it("has unique ids", () => {
    const ids = golden.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every line is well-formed (boolean labels, taxonomy intent or null)", () => {
    for (const g of golden) {
      expect(typeof g.id, g.id).toBe("string");
      expect(typeof g.scenario, g.id).toBe("string");
      expect(typeof g.input.isMachineSent, g.id).toBe("boolean");
      expect(typeof g.input.isBulk, g.id).toBe("boolean");
      expect(typeof g.expected, g.id).toBe("boolean");
      if (g.input.generalIntent !== null) {
        expect(VALID_INTENTS.has(g.input.generalIntent), `${g.id}: ${g.input.generalIntent}`).toBe(true);
      }
    }
  });

  it("is balanced enough to measure both precision and recall (>= 8 of each label)", () => {
    const pos = golden.filter((g) => g.expected).length;
    const neg = golden.length - pos;
    expect(pos, "reply-worthy positives").toBeGreaterThanOrEqual(8);
    expect(neg, "reply-worthy negatives").toBeGreaterThanOrEqual(8);
  });
});

describe("inbox reply-worthy golden — selectivity gate (precision/recall >= 0.90)", () => {
  const golden = loadGolden();

  const scored: Array<ReplyWorthyEvalCase & { id: string }> = golden.map((g) => ({
    id: g.id,
    predicted: isReplyWorthy(g.input).replyWorthy,
    expected: g.expected,
  }));

  const pr = replyWorthyPR(scored);

  it("report card", () => {
    const misses = scored.filter((s) => s.predicted !== s.expected).map((s) => s.id);
    // eslint-disable-next-line no-console
    console.log(
      `[inbox-reply-worthy] support=${pr.support} precision=${pr.precision.toFixed(3)} ` +
        `recall=${pr.recall.toFixed(3)} tp=${pr.tp} fp=${pr.fp} fn=${pr.fn} tn=${pr.tn}` +
        (misses.length ? ` misses=${misses.join(",")}` : " misses=none"),
    );
    expect(pr.support).toBeGreaterThanOrEqual(30);
  });

  it("precision >= 0.90 (do not offer drafts on machine/bulk/no-reply mail)", () => {
    expect(pr.precision).toBeGreaterThanOrEqual(0.9);
  });

  it("recall >= 0.90 (never hide a real reply opportunity — the cardinal sin)", () => {
    expect(pr.recall).toBeGreaterThanOrEqual(0.9);
  });

  it("zero false NOT-worthy on machine/no-reply-free human mail (no false negatives)", () => {
    const falseNegs = scored.filter((s) => !s.predicted && s.expected).map((s) => s.id);
    expect(falseNegs, `false negatives: ${falseNegs.join(",")}`).toHaveLength(0);
  });
});

describe("replyWorthyPR — pure metric", () => {
  it("perfect agreement scores 1/1", () => {
    const pr = replyWorthyPR([
      { predicted: true, expected: true },
      { predicted: false, expected: false },
    ]);
    expect(pr.precision).toBe(1);
    expect(pr.recall).toBe(1);
    expect(pr.tp).toBe(1);
    expect(pr.tn).toBe(1);
  });

  it("a false positive drops precision, not recall", () => {
    const pr = replyWorthyPR([
      { predicted: true, expected: true },
      { predicted: true, expected: false },
    ]);
    expect(pr.precision).toBeCloseTo(0.5, 5);
    expect(pr.recall).toBe(1);
  });

  it("a false negative drops recall, not precision", () => {
    const pr = replyWorthyPR([
      { predicted: true, expected: true },
      { predicted: false, expected: true },
    ]);
    expect(pr.recall).toBeCloseTo(0.5, 5);
    expect(pr.precision).toBe(1);
  });

  it("empty denominators score 1 (vacuous), support reflects count", () => {
    const pr = replyWorthyPR([{ predicted: false, expected: false }]);
    expect(pr.precision).toBe(1);
    expect(pr.recall).toBe(1);
    expect(pr.support).toBe(1);
  });
});
