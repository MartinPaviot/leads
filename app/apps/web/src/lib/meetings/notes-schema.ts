/**
 * Shared meeting-transcript extraction schema + prompt.
 *
 * One definition for BOTH extraction sites — the manual/upload path
 * (`/api/meetings/process-transcript`) and the Recall.ai bot webhook
 * (`/api/webhooks/recall`). Before this module each kept its own copy and they
 * drifted; the webhook copy was literally commented "same as
 * process-transcript".
 *
 * A recorded meeting is one step in the SAME qualification state a call is:
 * beyond the summary it extracts the deal's MEDDPICC spine, the contact's role
 * in the buying group, the account's triggers, and per-claim evidence — exactly
 * the shape `lib/voice/extraction-schema.ts` extracts for calls, so a recorded
 * meeting feeds the same call-intel surfaces (MeddpiccScorecard, AccountCallIntel,
 * ContactCallProfile). Every qualification field is optional: leave it null when
 * the meeting didn't cover it (an empty cell is the next meeting's agenda, never
 * something to invent).
 */

import { z } from "zod";

export const meetingNotesSchema = z.object({
  summary: z.string().describe("2-3 sentence meeting summary"),
  keyPoints: z.array(z.string()).describe("Key discussion points"),
  actionItems: z.array(
    z.object({
      owner: z.string().describe("Person responsible"),
      task: z.string().describe("Action item description"),
      deadline: z.string().nullable().describe("Deadline if mentioned"),
    }),
  ),
  decisions: z.array(z.string()).describe("Decisions made during the meeting"),
  participants: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
    }),
  ),
  buyingSignals: z.object({
    budget: z.string().nullable().describe("Budget mentions or constraints"),
    timeline: z.string().nullable().describe("Decision timeline mentioned"),
    currentStack: z
      .array(z.string())
      .describe("Tools / software / vendors the account uses today (the replaceable stack)"),
    painPoints: z.array(z.string()).describe("Pain points or challenges mentioned"),
    objections: z.array(z.string()).describe("Objections raised"),
    nextSteps: z.array(z.string()).describe("Agreed next steps"),
    competitors: z
      .array(z.string())
      .describe("Alternatives considered, including the status quo / doing nothing"),
    teamSize: z.string().nullable().describe("Team size if mentioned"),
    initiatives: z
      .array(z.string())
      .describe(
        "Concrete projects or triggers driving change at the account (a migration, a mandate, a reorg, a renewal) — only if explicitly mentioned",
      ),
  }),
  // The deal qualification spine (MEDDPICC). Fill ONLY what the transcript
  // actually revealed; a field stays null when it wasn't covered.
  meddic: z
    .object({
      metrics: z
        .string()
        .nullable()
        .describe("The quantified pain or ROI in the prospect's own terms (a number, %, time, cost)"),
      economicBuyer: z.string().nullable().describe("Who controls the budget or signs (name or role)"),
      decisionCriteria: z.array(z.string()).describe("What they will evaluate the solution on"),
      decisionProcess: z
        .string()
        .nullable()
        .describe("How they buy: steps, approvals, paper/legal process, timeline"),
      identifiedPain: z.string().nullable().describe("The single core pain driving a change"),
      champion: z
        .string()
        .nullable()
        .describe("Who is (or could become) selling this internally on our behalf"),
    })
    .nullable(),
  // The contact's role in the buying group, as revealed in the meeting.
  contactProfile: z
    .object({
      role: z.string().nullable().describe("The contact's actual role/function as revealed in the meeting"),
      isDecisionMaker: z.boolean().nullable().describe("Whether this person decides, as revealed in the meeting"),
      disposition: z
        .enum(["champion", "supporter", "neutral", "detractor"])
        .nullable()
        .describe("This person's stance toward us, based on what they said"),
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
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall meeting sentiment"),
});

export type MeetingNotes = z.infer<typeof meetingNotesSchema>;

/**
 * The extraction prompt, shared by both sites. `transcript` is sliced to 15k
 * chars by the caller's convention; pass the already-sliced text.
 */
export function buildMeetingNotesPrompt(args: {
  transcript: string;
  meetingTitle?: string | null;
  meetingDate?: string | null;
}): string {
  return `Analyze this meeting transcript and extract structured notes.

MEETING: ${args.meetingTitle || "Untitled Meeting"}
DATE: ${args.meetingDate || "Unknown"}

TRANSCRIPT:
${args.transcript}

RULES:
- Extract ONLY information explicitly stated in the transcript
- Do NOT invent or assume any information not in the transcript
- For buying signals, the MEDDPICC spine, the contact profile and evidence, only
  include what was explicitly said; set fields to null / leave arrays empty when
  the meeting didn't cover them (an empty cell is the next meeting's agenda)
- For evidence, pair each notable claim with the verbatim transcript line that grounds it
- Be specific with action items — include who and what`;
}
