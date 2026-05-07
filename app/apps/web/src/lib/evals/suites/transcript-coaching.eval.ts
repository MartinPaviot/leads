/**
 * Eval suite — transcript-coaching prompt-block format contract.
 *
 * Sprint-3 audit follow-up. The transcript-coaching surface
 * formats retrieved chunks into a prompt-injectable block. This
 * suite validates that `formatChunksForPrompt` produces a string
 * the LLM is contractually required to be able to cite from :
 *
 *   - Each chunk has a `[mm:ss]` or `[h:mm:ss]` marker that the
 *     UI's citation parser can recognise.
 *   - Chunks are grouped under `<meeting id="…">` tags so the
 *     downstream renderer attaches the right meetingId.
 *   - Empty input produces the canonical "no evidence" sentinel.
 *
 * This is the most fragile contract in the RAG pipeline — break the
 * format and the LLM either stops citing or cites the wrong meeting.
 */

import {
  formatChunksForPrompt,
  type RetrievedChunk,
} from "@/lib/coaching/retrieve-transcript-chunks";
import {
  runEvalSuite,
  type EvalSuite,
} from "../harness";

/**
 * Match `[mm:ss` or `[h:mm:ss` at the start of a citation in the
 * prompt block (which carries optional `, speaker` context). The
 * runtime parser in `citation-parser.ts` matches the LLM's *output*
 * format (no speaker), but the prompt-block *input* format includes
 * the speaker — we validate the input contract here separately.
 */
const PROMPT_TS_PATTERN = /\[(\d{1,2}(?::\d{1,2}){1,2})(?:,\s*[^\]]+)?\]/g;

function countPromptTimestamps(text: string): number {
  PROMPT_TS_PATTERN.lastIndex = 0;
  let n = 0;
  while (PROMPT_TS_PATTERN.exec(text) !== null) n++;
  return n;
}

function buildChunk(
  meetingId: string,
  startSec: number,
  speaker: string | null,
  text: string,
): RetrievedChunk {
  const promptLine = `[${formatTimestamp(startSec)}${speaker ? `, ${speaker}` : ""}]: "${text}"`;
  return {
    meetingId,
    speaker,
    startSec,
    endSec: startSec + 5,
    text,
    similarity: 0.9,
    source: "recall_bot",
    promptLine,
  };
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

interface Case {
  id: string;
  description: string;
  chunks: RetrievedChunk[];
  /** Predicate against the formatted output. */
  validate: (out: string) => boolean;
}

const cases: Case[] = [
  {
    id: "empty-no-evidence-marker",
    description: "empty input → sentinel string",
    chunks: [],
    validate: (out) => out === "(no relevant transcript chunks found)",
  },
  {
    id: "single-chunk-mm-ss",
    description: "single chunk wrapped in <meeting> with [mm:ss, speaker]",
    chunks: [buildChunk("m1", 754, "Jane", "We don't have budget.")],
    validate: (out) =>
      out.includes(`<meeting id="m1">`) &&
      out.includes(`[12:34, Jane]`) &&
      countPromptTimestamps(out) === 1,
  },
  {
    id: "single-chunk-h-mm-ss",
    description: "single chunk over 1h uses [h:mm:ss] form",
    chunks: [buildChunk("m2", 3725, "Bob", "Two months feels tight.")],
    validate: (out) =>
      out.includes(`[1:02:05, Bob]`) && countPromptTimestamps(out) === 1,
  },
  {
    id: "multi-chunk-same-meeting",
    description: "two chunks same meeting → one section, two markers",
    chunks: [
      buildChunk("m3", 60, "Jane", "Hello."),
      buildChunk("m3", 120, "Bob", "Hi."),
    ],
    validate: (out) => {
      const meetingTags = (out.match(/<meeting id="/g) ?? []).length;
      return meetingTags === 1 && countPromptTimestamps(out) === 2;
    },
  },
  {
    id: "multi-chunk-multi-meeting",
    description: "chunks across 2 meetings → 2 sections preserve meetingId",
    chunks: [
      buildChunk("m4", 30, "Jane", "From meeting four."),
      buildChunk("m5", 45, "Bob", "From meeting five."),
    ],
    validate: (out) =>
      out.includes(`<meeting id="m4">`) &&
      out.includes(`<meeting id="m5">`) &&
      countPromptTimestamps(out) === 2,
  },
  {
    id: "no-speaker-falls-back",
    description: "chunk without speaker → marker has no speaker tag",
    chunks: [buildChunk("m6", 90, null, "Speaker-less line.")],
    validate: (out) => /\[1:30\]/.test(out) && countPromptTimestamps(out) === 1,
  },
  {
    id: "verbatim-text-preserved",
    description: "the chunk's text is preserved verbatim in the output",
    chunks: [buildChunk("m7", 0, "Jane", "Verbatim quote test.")],
    validate: (out) => out.includes("Verbatim quote test."),
  },
];

export const transcriptCoachingEvalSuite: EvalSuite<string> = {
  surfaceId: "transcript-coaching",
  promptId: "transcript-coaching-format.v1",
  cases: cases.map((c) => ({
    id: c.id,
    description: c.description,
    run: async () => formatChunksForPrompt(c.chunks),
    predicate: (out) => c.validate(out),
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

export async function runTranscriptCoachingEval() {
  return runEvalSuite(transcriptCoachingEvalSuite);
}
