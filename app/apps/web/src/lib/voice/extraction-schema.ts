/**
 * Zod schema for LLM-extracted call notes.
 *
 * Mirrors the meetings notes schema but adds outcome classification —
 * a meeting always happens, a call may not (voicemail, gatekeeper,
 * wrong number). Reused by both the post-call worker and the
 * `/finalize` route.
 */

import { z } from "zod";

export const callOutcomeLiteral = z.enum([
  "connected",
  "voicemail_left",
  "no_answer",
  "busy",
  "gatekeeper",
  "wrong_number",
  "do_not_call",
  "meeting_booked",
  "callback_requested",
  "not_interested",
  "failed",
]);

export const callNotesSchema = z.object({
  summary: z.string().describe("2-3 sentence call summary"),
  outcome: callOutcomeLiteral.describe(
    "Classify the call outcome based on what actually happened in the transcript",
  ),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  keyPoints: z.array(z.string()),
  actionItems: z.array(
    z.object({
      owner: z.string(),
      task: z.string(),
      deadline: z.string().nullable(),
    }),
  ),
  buyingSignals: z.object({
    budget: z.string().nullable(),
    timeline: z.string().nullable(),
    currentStack: z.array(z.string()),
    painPoints: z.array(z.string()),
    objections: z.array(z.string()),
    nextSteps: z.array(z.string()),
    competitors: z.array(z.string()),
    teamSize: z.string().nullable(),
  }),
  callbackRequest: z
    .object({
      requested: z.boolean(),
      whenIso: z.string().nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
});

export type CallNotes = z.infer<typeof callNotesSchema>;
