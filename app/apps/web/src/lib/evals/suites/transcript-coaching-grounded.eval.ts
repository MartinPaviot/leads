/**
 * Grounded LLM eval suite for transcript coaching (P0-4 tasks 4.2 + 4.3).
 *
 * Two halves :
 *
 *  HALF A — grounding (4.2)
 *    Synthetic fixtures : transcript + question where ground truth
 *    is known by construction. The LLM must cite the right `[mm:ss]`,
 *    quote verbatim, and not hallucinate dollar amounts / names /
 *    years that aren't in the chunks.
 *
 *  HALF B — refusal (4.3)
 *    Cases where the chunks are empty or off-topic. The LLM must
 *    trigger one of the canonical refusal patterns rather than fall
 *    back to general knowledge.
 *
 * Architecture :
 *  - The suite is parameterised on a `runLlm(question, chunks)` fn
 *    so tests can inject deterministic stubs. Production wires the
 *    real Anthropic call.
 *  - Each case's predicate runs `scoreGrounding` (or `refusalDetected`)
 *    and gates on a threshold. Per-case latency + score lands in the
 *    eval-run row.
 */

import { runEvalSuite, type EvalSuite } from "../harness";
import {
  scoreGrounding,
  refusalDetected,
  type GroundingScore,
} from "@/lib/coaching/grounded-eval";
import {
  formatChunksForPrompt,
  type RetrievedChunk,
} from "@/lib/coaching/retrieve-transcript-chunks";

export interface RunLlmFn {
  (question: string, formattedChunks: string): Promise<string>;
}

interface GroundedCase {
  id: string;
  description: string;
  question: string;
  chunks: RetrievedChunk[];
  /** Minimum overall grounding score to pass. Default 0.7. */
  minScore?: number;
  /** Refusal cases set this to true ; predicate switches to
   *  `refusalDetected` instead of grounding score. */
  expectsRefusal?: boolean;
}

function chunk(args: {
  meetingId: string;
  startSec: number;
  speaker: string | null;
  text: string;
}): RetrievedChunk {
  const ts = formatTs(args.startSec);
  const speakerTag = args.speaker ? `, ${args.speaker}` : "";
  return {
    meetingId: args.meetingId,
    speaker: args.speaker,
    startSec: args.startSec,
    endSec: args.startSec + 8,
    text: args.text,
    similarity: 0.9,
    source: "recall_bot",
    promptLine: `[${ts}${speakerTag}]: "${args.text}"`,
  };
}

function formatTs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// ── Half A — grounding fixtures ──────────────────────────────

const groundingCases: GroundedCase[] = [
  {
    id: "budget-direct-quote",
    description:
      "Budget question, direct verbatim answer with [mm:ss] cite",
    question: "Did Sarah confirm the budget?",
    chunks: [
      chunk({
        meetingId: "m-1",
        startSec: 754,
        speaker: "Sarah",
        text: "Our budget for this is $50K, locked in by finance.",
      }),
    ],
  },
  {
    id: "objection-multi-chunk",
    description:
      "Objection spanning two chunks ; LLM must pick the closer one",
    question: "What is Bob's main objection?",
    chunks: [
      chunk({
        meetingId: "m-2",
        startSec: 120,
        speaker: "Bob",
        text: "Honestly, the timeline of two months feels really tight.",
      }),
      chunk({
        meetingId: "m-2",
        startSec: 240,
        speaker: "Bob",
        text: "We've been burned on rollouts that were rushed before.",
      }),
    ],
  },
  {
    id: "competitor-named-entity",
    description:
      "Competitor name must come from chunks, not invention",
    question: "Which competitor are they evaluating?",
    chunks: [
      chunk({
        meetingId: "m-3",
        startSec: 60,
        speaker: "Pat",
        text: "We're also looking at Acme Tools alongside you.",
      }),
    ],
  },
  {
    id: "timeline-q4-2026",
    description:
      "Timeline year must come from chunks ; year hallucination is the failure mode",
    question: "When are they targeting close?",
    chunks: [
      chunk({
        meetingId: "m-4",
        startSec: 90,
        speaker: "Pat",
        text: "Goal is to wrap up by Q4 2026, board's hard deadline.",
      }),
    ],
  },
  {
    id: "stakeholder-decision-maker",
    description:
      "Decision-maker name straight from transcript ; tests named-entity grounding",
    question: "Who is the decision-maker?",
    chunks: [
      chunk({
        meetingId: "m-5",
        startSec: 200,
        speaker: "Sarah",
        text: "John Stevenson is our economic buyer ; everything goes through him.",
      }),
    ],
  },
];

// ── Half B — refusal fixtures ────────────────────────────────

const refusalCases: GroundedCase[] = [
  {
    id: "refusal-empty-chunks",
    description: "No chunks retrieved → must refuse, not invent",
    question: "What did they say about pricing?",
    chunks: [],
    expectsRefusal: true,
  },
  {
    id: "refusal-off-topic-chunks",
    description: "Chunks irrelevant to question → must refuse",
    question: "What is their procurement process?",
    chunks: [
      chunk({
        meetingId: "m-x",
        startSec: 30,
        speaker: "Sarah",
        text: "The weather in Paris is great this time of year.",
      }),
    ],
    expectsRefusal: true,
  },
  {
    id: "refusal-numeric-claim-not-supported",
    description:
      "Question asks for a number that isn't in chunks → refuse",
    question: "What's their team size?",
    chunks: [
      chunk({
        meetingId: "m-y",
        startSec: 60,
        speaker: "Pat",
        text: "We're growing fast — hired a lot of new people lately.",
      }),
    ],
    expectsRefusal: true,
  },
];

// ── Suite builder ────────────────────────────────────────────

interface BuildSuiteArgs {
  runLlm: RunLlmFn;
  /** Override pass threshold. Defaults to 0.7. */
  defaultMinScore?: number;
}

export function buildGroundedCoachingSuite(
  args: BuildSuiteArgs,
): EvalSuite<{
  caseId: string;
  output: string;
  score: GroundingScore | null;
  refusalOk: boolean | null;
}> {
  const { runLlm, defaultMinScore = 0.7 } = args;

  const allCases = [...groundingCases, ...refusalCases];

  return {
    surfaceId: "transcript-coaching-grounded",
    promptId: "transcript-coaching-grounded.v1",
    cases: allCases.map((c) => ({
      id: c.id,
      description: c.description,
      run: async () => {
        const formatted = formatChunksForPrompt(c.chunks);
        const output = await runLlm(c.question, formatted);
        if (c.expectsRefusal) {
          return {
            caseId: c.id,
            output,
            score: null,
            refusalOk: refusalDetected(output),
          };
        }
        return {
          caseId: c.id,
          output,
          score: scoreGrounding(output, c.chunks),
          refusalOk: null,
        };
      },
      predicate: (result) => {
        if (result.refusalOk !== null) {
          return result.refusalOk;
        }
        if (!result.score) return false;
        const threshold = c.minScore ?? defaultMinScore;
        return result.score.overall >= threshold;
      },
    })),
    aggregateMetrics: (results) => {
      const groundingResults = results.filter((r) => r.output.score !== null);
      const refusalResults = results.filter((r) => r.output.refusalOk !== null);

      const meanCitationAccuracy =
        groundingResults.length === 0
          ? 0
          : groundingResults.reduce(
              (acc, r) => acc + (r.output.score?.citationAccuracy ?? 0),
              0,
            ) / groundingResults.length;

      const meanVerbatim =
        groundingResults.length === 0
          ? 0
          : groundingResults.reduce(
              (acc, r) => acc + (r.output.score?.verbatim ?? 0),
              0,
            ) / groundingResults.length;

      const refusalPassRate =
        refusalResults.length === 0
          ? 0
          : refusalResults.filter((r) => r.passed).length /
            refusalResults.length;

      const groundingPassRate =
        groundingResults.length === 0
          ? 0
          : groundingResults.filter((r) => r.passed).length /
            groundingResults.length;

      return {
        pass_rate: results.length === 0
          ? 0
          : results.filter((r) => r.passed).length / results.length,
        grounding_pass_rate: groundingPassRate,
        refusal_pass_rate: refusalPassRate,
        mean_citation_accuracy: meanCitationAccuracy,
        mean_verbatim: meanVerbatim,
        total_cases: results.length,
        grounding_cases: groundingResults.length,
        refusal_cases: refusalResults.length,
      };
    },
  };
}

/**
 * Convenience runner — wires the real Anthropic LLM via the existing
 * `traced-ai` wrapper. Production cron uses this ; tests inject a
 * stub via `buildGroundedCoachingSuite` directly.
 *
 * The system prompt mirrors what the chat tool feeds the model :
 * "cite [mm:ss], quote verbatim, refuse if no evidence". Keeping
 * the prompt here means the eval evolves alongside the prompt
 * without runtime drift.
 */
export const GROUNDED_SYSTEM_PROMPT = `You are a sales coach answering a founder's
question using ONLY the transcript chunks provided. Rules :
1. Quote verbatim from the chunks. Do not paraphrase.
2. Every claim must be followed by a [mm:ss] timestamp citation
   matching the chunk you quoted.
3. If the chunks do not answer the question, respond with exactly :
   "I don't have evidence in the transcript for this."
   Do NOT fall back to general knowledge.`;

export async function runGroundedCoachingEval(runLlm: RunLlmFn) {
  return runEvalSuite(buildGroundedCoachingSuite({ runLlm }));
}

export const __testCases = {
  groundingCases,
  refusalCases,
};
