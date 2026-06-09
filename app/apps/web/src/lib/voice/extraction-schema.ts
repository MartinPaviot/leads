/**
 * Zod schema for LLM-extracted call notes.
 *
 * Mirrors the meetings notes schema but adds outcome classification —
 * a meeting always happens, a call may not (voicemail, gatekeeper,
 * wrong number). Reused by both the post-call worker and the
 * `/finalize` route.
 *
 * The call is treated as one step in a QUALIFICATION STATE: beyond the raw
 * summary it extracts the deal's MEDDPICC spine, the contact's role in the
 * buying group, the account's triggers, and per-claim evidence (a fact without
 * a supporting quote must not be asserted on a fiche). Every field is optional
 * — leave it null when the call didn't cover it (an empty cell is the agenda
 * for the next call, never something to invent).
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
    currentStack: z.array(z.string()).describe("Tools / software / vendors the account uses today (the replaceable stack)"),
    painPoints: z.array(z.string()),
    objections: z.array(z.string()),
    nextSteps: z.array(z.string()),
    competitors: z.array(z.string()).describe("Alternatives considered, including the status quo / doing nothing"),
    teamSize: z.string().nullable(),
    initiatives: z.array(z.string()).describe("Concrete projects or triggers driving change at the account (a migration, a mandate, a reorg, a renewal) — only if explicitly mentioned"),
  }),
  // The deal qualification spine (MEDDPICC). Fill ONLY what the transcript
  // actually revealed; a field stays null when it wasn't covered.
  meddic: z
    .object({
      metrics: z.string().nullable().describe("The quantified pain or ROI in the prospect's own terms (a number, %, time, cost)"),
      economicBuyer: z.string().nullable().describe("Who controls the budget or signs (name or role)"),
      decisionCriteria: z.array(z.string()).describe("What they will evaluate the solution on"),
      decisionProcess: z.string().nullable().describe("How they buy: steps, approvals, paper/legal process, timeline"),
      identifiedPain: z.string().nullable().describe("The single core pain driving a change"),
      champion: z.string().nullable().describe("Who is (or could become) selling this internally on our behalf"),
    })
    .nullable(),
  // The contact's role in the buying group, as revealed on the call.
  contactProfile: z
    .object({
      role: z.string().nullable().describe("The contact's actual role/function as revealed on the call"),
      isDecisionMaker: z.boolean().nullable().describe("Whether this person decides, as revealed on the call"),
      disposition: z.enum(["champion", "supporter", "neutral", "detractor"]).nullable().describe("This person's stance toward us, based on what they said"),
    })
    .nullable(),
  // Provenance: notable claims paired with the verbatim transcript line that
  // grounds them. A fact without a quote should not be asserted on a fiche.
  evidence: z
    .array(
      z.object({
        claim: z.string().describe("A captured fact — a pain, a budget, a competitor, a role, an initiative"),
        quote: z.string().describe("The verbatim transcript line that supports the claim"),
      }),
    )
    .describe("Key claims with the exact quote that grounds each one"),
  callbackRequest: z
    .object({
      requested: z.boolean(),
      whenIso: z.string().nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
});

export type CallNotes = z.infer<typeof callNotesSchema>;
