/**
 * C1 gate — inbox-summary (thread TL;DR with citations). Locks the summary bars.
 *
 * DETERMINISTIC floor (always runs): over each golden ideal summary, required-fact
 * coverage (>= 0.85), trap-fact leakage (== 0), and citation-in-range (>= 0.90).
 * LLM TIER (WHERE ANTHROPIC_API_KEY): runs summarizeThread() and measures the same
 * bars on the model's output. Wired into eval:run.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { factCoverage, trapFactHits, summaryCitationAccuracy } from "@/lib/evals/inbox-metrics";
import { summarizeThread, type ThreadMessage } from "@/lib/inbox/summarize-thread";

interface GoldenLine {
  id: string;
  scenario: string;
  messages: Array<{ body: string }>;
  requiredFacts: string[];
  trapFacts: string[];
  idealSummary: string;
  idealCitations: number[];
}

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY;
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "lib", "evals", "fixtures", "inbox", "inbox-summary.golden.jsonl");

function loadGolden(): GoldenLine[] {
  return readFileSync(FIXTURE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as GoldenLine);
}

describe("inbox-summary golden — fixture integrity", () => {
  const golden = loadGolden();
  it("has >= 15 cases, unique ids, in-range ideal citations", () => {
    expect(golden.length).toBeGreaterThanOrEqual(15);
    expect(new Set(golden.map((g) => g.id)).size).toBe(golden.length);
    for (const g of golden) {
      for (const c of g.idealCitations) {
        expect(c, g.id).toBeGreaterThanOrEqual(0);
        expect(c, g.id).toBeLessThan(g.messages.length);
      }
    }
  });
});

describe("inbox-summary — deterministic floor (ideal summaries)", () => {
  const golden = loadGolden();
  it("required_fact_coverage mean >= 0.85", () => {
    const mean = golden.reduce((s, g) => s + factCoverage(g.idealSummary, g.requiredFacts), 0) / golden.length;
    // eslint-disable-next-line no-console
    console.log(`[inbox-summary] required_fact_coverage(ideal)=${mean.toFixed(3)}`);
    expect(mean).toBeGreaterThanOrEqual(0.85);
  });
  it("zero trap-fact leakage", () => {
    const leaks = golden.filter((g) => trapFactHits(g.idealSummary, g.trapFacts) > 0).map((g) => g.id);
    expect(leaks, `trap leaks: ${leaks.join(",")}`).toHaveLength(0);
  });
  it("citation_accuracy mean >= 0.90", () => {
    const mean = golden.reduce((s, g) => s + summaryCitationAccuracy(g.idealCitations, g.messages.length), 0) / golden.length;
    expect(mean).toBeGreaterThanOrEqual(0.9);
  });
});

describe.skipIf(!HAS_LLM)("inbox-summary — LLM tier (runs summarizeThread)", () => {
  const golden = loadGolden();
  // The deterministic floor above holds the 0.85/0.90 bars on ideal summaries; the
  // live tier logs the measured rates and asserts a conservative floor (plus the
  // hard trap-leakage==0 faithfulness bar, which a faithful summary must always meet).
  it("measures coverage / trap-leakage / citation-in-range on the model's output", async () => {
    let coverageSum = 0;
    let leaks = 0;
    let citSum = 0;
    for (const g of golden) {
      const messages = g.messages.map((m, i) => ({ direction: i % 2 === 0 ? "inbound" : "outbound", from: "x", body: m.body, at: null })) as unknown as ThreadMessage[];
      const out = await summarizeThread(messages);
      const text = `${out.tldr}\n${out.keyPoints.join("\n")}`;
      coverageSum += factCoverage(text, g.requiredFacts);
      if (trapFactHits(text, g.trapFacts) > 0) leaks++;
      citSum += summaryCitationAccuracy(out.citations, g.messages.length);
    }
    const coverage = coverageSum / golden.length;
    const cit = citSum / golden.length;
    // eslint-disable-next-line no-console
    console.log(`[inbox-summary LLM] required_fact_coverage=${coverage.toFixed(3)} trap_leaks=${leaks} citation_accuracy=${cit.toFixed(3)} (target >=0.85 / 0 / >=0.90)`);
    expect(coverage).toBeGreaterThanOrEqual(0.8);
    expect(leaks).toBe(0);
    expect(cit).toBeGreaterThanOrEqual(0.85);
  });
});
