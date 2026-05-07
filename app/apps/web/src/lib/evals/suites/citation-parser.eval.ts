/**
 * Eval suite — citation parser (no LLM, deterministic).
 *
 * The parser is pure code, but the harness still proves the eval
 * pattern end-to-end : declare cases, predicate, run, persist row.
 * Once additional LLM-backed surfaces ship (deal-briefing, churn-risk,
 * transcript-coaching), they follow this exact shape.
 */

import {
  parseCitations,
  type CitationToken,
} from "@/lib/coaching/citation-parser";
import {
  runEvalSuite,
  type EvalSuite,
} from "../harness";

interface CitationCaseInput {
  text: string;
  expectedSeconds: number[];
}

const cases: CitationCaseInput[] = [
  { text: "She said [12:34] that the budget is tight.", expectedSeconds: [754] },
  { text: "First [01:00] then [02:30] then [03:45].", expectedSeconds: [60, 150, 225] },
  { text: "After an hour: [1:02:03] something happened.", expectedSeconds: [3723] },
  { text: "Quick check: [5:09] there.", expectedSeconds: [309] },
  { text: "[99:99] this should be rejected.", expectedSeconds: [] },
  { text: "Plain prose with no citations whatsoever.", expectedSeconds: [] },
  { text: "[12:34] at start, middle [02:00], end [00:30]", expectedSeconds: [754, 120, 30] },
  { text: "Bracketed footnote [12] should be ignored.", expectedSeconds: [] },
];

export const citationParserEvalSuite: EvalSuite<CitationToken[]> = {
  surfaceId: "citation-parser",
  promptId: "citation-parser.v1",
  cases: cases.map((c, i) => ({
    id: `citation-${i + 1}`,
    description: c.text.slice(0, 60),
    run: async () => parseCitations(c.text),
    predicate: (out) => {
      return (
        out.length === c.expectedSeconds.length &&
        c.expectedSeconds.every((s, idx) => out[idx]?.seconds === s)
      );
    },
  })),
  aggregateMetrics: (results) => {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    return {
      pass_rate: total ? passed / total : 0,
      total_cases: total,
    };
  },
};

/** Convenience entry — runs the suite and returns the summary. */
export async function runCitationParserEval() {
  return runEvalSuite(citationParserEvalSuite);
}
