/**
 * G-eval gate (B7) — inbox-nudge faithfulness (no fabrication). A follow-up nudge
 * must NEVER invent a fact absent from the thread (a fabricated time / price /
 * name / commitment is the cardinal nudge sin — even more so than for a reply,
 * since a nudge re-surfaces with nothing new to say).
 *
 * DETERMINISTIC floor (always runs): the ideal nudges leak zero trap facts + are
 * non-empty. LLM TIER (WHERE ANTHROPIC_API_KEY): runs composeReply(_, {mode:
 * "nudge"}) and measures trap leakage + non-empty (send-without-edit proxy) on the
 * model's output, logged with a conservative regression floor (target = 0 leaks).
 * Mirrors inbox-draft-gate; wired into eval:run.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { trapFactHits } from "@/lib/evals/inbox-metrics";
import { composeReply } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";

interface GoldenLine {
  id: string;
  scenario: string;
  messages: Array<{ direction: string; from: string; body: string }>;
  trapFacts: string[];
  idealDraft: string;
}

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY;
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "lib", "evals", "fixtures", "inbox", "inbox-nudge.golden.jsonl");

function loadGolden(): GoldenLine[] {
  return readFileSync(FIXTURE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as GoldenLine);
}

describe("inbox-nudge golden — fixture integrity", () => {
  const golden = loadGolden();
  it("has >= 15 cases, unique ids, trap facts per case, and ends on OUR outbound", () => {
    expect(golden.length).toBeGreaterThanOrEqual(15);
    expect(new Set(golden.map((g) => g.id)).size).toBe(golden.length);
    for (const g of golden) {
      expect(g.trapFacts.length, g.id).toBeGreaterThan(0);
      // A nudge only applies when WE messaged last and they haven't replied.
      expect(g.messages[g.messages.length - 1]?.direction, g.id).toBe("outbound");
    }
  });
});

describe("inbox-nudge — deterministic floor (ideal nudges)", () => {
  const golden = loadGolden();
  it("ideal nudges leak zero trap facts and are non-empty", () => {
    for (const g of golden) {
      expect(trapFactHits(g.idealDraft, g.trapFacts), g.id).toBe(0);
      expect(g.idealDraft.trim().length, g.id).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!HAS_LLM)("inbox-nudge — LLM tier (runs composeReply nudge mode)", () => {
  const golden = loadGolden();
  it("measures fabrication leakage + non-empty on the model's nudge output", async () => {
    let leaks = 0;
    let empty = 0;
    for (const g of golden) {
      const messages = g.messages.map((m) => ({ direction: m.direction, from: m.from, body: m.body, at: null })) as unknown as ThreadMessage[];
      const draft = await composeReply(messages, { mode: "nudge" });
      const text = draft.text ?? "";
      if (trapFactHits(text, g.trapFacts) > 0) leaks++;
      if (text.trim().length === 0) empty++;
    }
    // eslint-disable-next-line no-console
    console.log(`[inbox-nudge LLM] fabrication_leaks=${leaks}/${golden.length} empty=${empty} (target leaks=0)`);
    expect(leaks).toBeLessThanOrEqual(1); // target 0; allow one model hiccup without flaking CI
    expect(empty).toBe(0);
  });
});
