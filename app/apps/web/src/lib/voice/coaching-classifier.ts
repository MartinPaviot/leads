/**
 * Live coaching classifier — turns a window of prospect transcript
 * into an objection class + the matching playbook responses.
 *
 * Designed to be cheap (Haiku 4.5, ~500 tokens per call) and to run
 * inline from the Twilio↔Deepgram bridge. The bridge owns the
 * debounce + prefilter; this module is the LLM round-trip.
 */

import { z } from "zod";
import { generateObject } from "ai";
import {
  PLAYBOOK,
  lookupPlaybook,
  type ObjectionClass,
  type PlaybookEntry,
} from "./coaching-playbook";

const objectionClassValues = Object.keys(PLAYBOOK) as [
  ObjectionClass,
  ...ObjectionClass[],
];

const classifierSchema = z.object({
  objectionDetected: z.boolean(),
  objectionClass: z.enum(objectionClassValues).nullable(),
  prospectQuote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ClassifierResult = z.infer<typeof classifierSchema>;

export interface CoachingCard {
  ts: number; // ms since epoch
  objectionClass: ObjectionClass;
  label: string;
  prospectQuote: string;
  suggestedResponses: string[];
}

export interface ClassifierDeps {
  /** Inject the model — pass `anthropic("claude-haiku-4-5-20251001")` in
   *  production. Tests pass a mock. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  /** Override generateObject for tests. */
  generate?: typeof generateObject;
}

export interface ClassifyInput {
  /** The most recent prospect utterance(s), already filtered. */
  prospectWindow: string;
  /** Last ~4 chunks of agent context — gives Haiku the conversation arc. */
  agentContext?: string;
  /** Optional callback for tracing. */
  onTrace?: (info: { latencyMs: number; result: ClassifierResult }) => void;
}

const SYSTEM_PROMPT = `You classify cold-call objections from a live transcript chunk. Output strict JSON matching the schema.

Rules:
- Set objectionDetected=true ONLY if the prospect raised a clear objection in this window.
- Pick the single best objectionClass from the enum, or null if none fits.
- Quote the exact prospect phrasing in prospectQuote (≤ 80 chars).
- confidence ∈ [0, 1]; under 0.55 we will discard the result.
- Be conservative — a hesitation ("hmm", "I'll think about it") is "not_the_right_time" only if context confirms it.`;

export async function classifyObjection(
  input: ClassifyInput,
  deps: ClassifierDeps,
): Promise<CoachingCard | null> {
  const generate = deps.generate ?? generateObject;
  const startedAt = Date.now();
  let result: ClassifierResult;
  try {
    const { object } = await generate({
      model: deps.model,
      schema: classifierSchema,
      system: SYSTEM_PROMPT,
      prompt: `AGENT CONTEXT (last 4 utterances):
${input.agentContext ?? "(none)"}

PROSPECT WINDOW:
${input.prospectWindow}

Classify the prospect's stance in this window.`,
    });
    result = object as ClassifierResult;
  } catch {
    // LLM hiccups must not crash the bridge — a missed card is fine.
    return null;
  }

  const latencyMs = Date.now() - startedAt;
  input.onTrace?.({ latencyMs, result });

  if (
    !result.objectionDetected ||
    !result.objectionClass ||
    !result.prospectQuote ||
    result.confidence < 0.55
  ) {
    return null;
  }

  const entry: PlaybookEntry | null = lookupPlaybook(result.objectionClass);
  if (!entry) return null;

  return {
    ts: Date.now(),
    objectionClass: entry.objectionClass,
    label: entry.label,
    prospectQuote: result.prospectQuote,
    suggestedResponses: entry.suggestedResponses,
  };
}
