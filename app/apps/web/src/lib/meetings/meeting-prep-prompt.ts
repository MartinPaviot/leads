/**
 * Meeting-prep PROMPT seam — the pure, DB-free core of the prep generation.
 *
 * `generateMeetingPrep` (inngest/meeting-functions.ts) gathers the company-brain
 * context, derives the moment, then formats a prompt and calls the LLM. Extracting
 * the prompt here (BYTE-IDENTICAL) lets the meeting-prep grounding eval
 * (lib/evals/meeting-prep-*) exercise the EXACT prod prompt against synthetic
 * contexts — no DB, no drift — instead of a hand-copied replica that silently rots.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

/** Prod model choice for meeting prep (mirrors meeting-functions.ts). Null when no key. */
export function getMeetingPrepModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

/** The moment-doctrine block, or "" when there's no rubric for this moment. */
export function buildDoctrineBlock(
  moment: string,
  rubric: string | null | undefined,
): string {
  return rubric
    ? `\n## Method doctrine for a ${moment.replace("_", " ")} meeting (apply these rules to THIS account; do not restate them)\n${rubric}\n`
    : "";
}

/** The tactical prep prompt (byte-identical to prod). */
export function buildMeetingPrepPrompt(
  moment: string,
  context: string,
  doctrineBlock: string,
): string {
  return `Generate a concise, tactical prep document for an upcoming ${moment.replace("_", " ")} meeting. Specialize it to this moment: a discovery diagnoses and quantifies the gap, a demo proves the gap closes against named pains, a proposal/close drives the decision.

${context}
${doctrineBlock}
Tailor every section to a ${moment.replace("_", " ")} meeting:
1. Account snapshot (what we know about the company/contact)
2. Key attendees and their roles
3. Recent interaction summary
4. The specific play for this moment (apply the doctrine above to THIS account)
5. Questions or talking points that fit this moment
6. Likely objections for this moment, with responses

Ground everything in the data above; never invent a fact (write "unknown" if needed). Keep it actionable and under 500 words.`;
}
