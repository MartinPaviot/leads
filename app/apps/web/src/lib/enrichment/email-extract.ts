/**
 * LLM-based extractor that turns an email body into structured CRM signals.
 *
 * Runs asynchronously after an email is ingested (Gmail or Graph). Designed
 * for Haiku-class models: a single call extracts sentiment, intent, objections,
 * competitors, next steps, budget/value hints, etc. Caller persists the
 * result to activity.sentiment / activity.intent / activity.metadata.
 *
 * Coverage (cf. _research/SOURCES_ANALYSIS.md §6.3 Module 1):
 *   - field 29 — sentiment
 *   - field 31 — intent (partial, via subject/body cues)
 *   - field 32 — objections
 *   - field 34 — competitors mentioned
 *   - field 37 — deal.value hint (extracted budget)
 *   - field 39 — close date hint (extracted timeframe)
 *   - field 42 — next step
 *   - field 43 — promises
 *   - field 46 — blockers
 *   - field 49 — champion/blocker signals
 *
 * Philosophy: only persist extractions with confidence ≥ medium.
 * We don't hallucinate fields. If the model can't find a value, it returns null.
 */

import { z } from "zod";

export const emailExtractionSchema = z.object({
  sentiment: z
    .enum(["positive", "neutral", "negative"])
    .describe("Overall sentiment of the sender toward our product or company"),
  sentimentConfidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence in the sentiment classification"),
  intent: z
    .array(
      z.enum([
        "interested",
        "pricing_inquiry",
        "demo_request",
        "objection",
        "not_interested",
        "out_of_office",
        "introduction",
        "follow_up",
        "thank_you",
        "internal_forward",
        "calendar_scheduling",
        "feature_request",
        "support_request",
        "unsubscribe",
      ]),
    )
    .describe("One or more intents visible in this message"),
  objections: z
    .array(z.string())
    .describe(
      "Explicit concerns or objections the sender raised (e.g. 'too expensive', 'need buy-in from CFO'). Empty array if none.",
    ),
  competitorsMentioned: z
    .array(z.string())
    .describe(
      "Names of competing products or vendors mentioned. Empty array if none.",
    ),
  budgetMentioned: z
    .string()
    .nullable()
    .describe(
      "Budget or pricing amount mentioned (keep original units/currency). Null if not mentioned.",
    ),
  timeframeMentioned: z
    .string()
    .nullable()
    .describe(
      "Any timeframe or target date mentioned (e.g. 'end of Q2', 'by March 15'). Null if not mentioned.",
    ),
  nextSteps: z
    .array(
      z.object({
        owner: z
          .enum(["sender", "recipient", "both", "unknown"])
          .describe("Who committed to this next step"),
        action: z.string().describe("The action to be done"),
        dueDate: z
          .string()
          .nullable()
          .describe("ISO date or relative if mentioned, else null"),
      }),
    )
    .describe("Concrete next steps committed to in this email"),
  championSignals: z
    .array(z.string())
    .describe(
      "Phrases suggesting the sender advocates internally for us (e.g. 'I'll bring this to the team'). Empty if none.",
    ),
  blockerSignals: z
    .array(z.string())
    .describe(
      "Phrases suggesting a blocker or stall (e.g. 'we've paused evaluation'). Empty if none.",
    ),
  decisionMakerMentioned: z
    .string()
    .nullable()
    .describe(
      "If the email references a decision-maker by name or role ('our CFO Alice approves budget'), capture it. Null otherwise.",
    ),
  isAutomated: z
    .boolean()
    .describe(
      "True if this appears to be an auto-responder, newsletter, or bulk mail (should not trigger downstream extraction).",
    ),
});

export type EmailExtraction = z.infer<typeof emailExtractionSchema>;

/**
 * Build the prompt used for extraction. Kept separate so tests can snapshot
 * it and prompt tuning doesn't require touching the extractor logic.
 */
export function buildEmailExtractionPrompt(args: {
  subject: string;
  fromHeader: string;
  direction: "inbound" | "outbound";
  body: string;
  competitorList?: string[];
}): string {
  const competitorHint = args.competitorList?.length
    ? `\n\nKnown competitor names to watch for: ${args.competitorList.join(", ")}`
    : "";
  return `You are extracting sales-relevant signals from a single email.

FROM: ${args.fromHeader}
SUBJECT: ${args.subject}
DIRECTION: ${args.direction === "inbound" ? "They emailed us" : "We emailed them"}${competitorHint}

BODY:
${truncateForLLM(args.body, 4000)}

Rules:
- Extract only what the email EXPLICITLY states or strongly implies. Do NOT invent facts.
- If a field is not clearly derivable, return null, [] or "unknown" as appropriate.
- For automated messages (auto-responders, calendar invites only, newsletters), set isAutomated=true and keep all other fields minimal.
- Competitor mentions count only for tools/vendors explicitly named — not generic terms like "current solution".
- Next-step owner: use "sender" when the email writer committed, "recipient" when they ask us to do something, "both" for joint commitments.
`;
}

/**
 * Heuristic truncation that keeps the top and bottom of a long email so the
 * signature (often at the bottom) and the opening context are both retained.
 */
export function truncateForLLM(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const head = body.slice(0, Math.floor(maxChars * 0.7));
  const tail = body.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[...truncated...]\n\n${tail}`;
}

const AUTOMATED_SUBJECT_PATTERNS: RegExp[] = [
  /out of office/i,
  /auto[-\s]?reply/i,
  /automatic reply/i,
  /unsubscribe/i,
  /newsletter/i,
  /delivery status notification/i,
  /undeliverable/i,
  /invitation:/i,
  /\[spam\]/i,
];

/**
 * Quick filter to skip obvious auto-generated mail before spending LLM credits.
 * Callers should pair this with a check on From headers like `noreply@` or
 * `mailer-daemon@`.
 */
export function looksAutomated(args: {
  subject: string;
  fromHeader: string;
}): boolean {
  if (AUTOMATED_SUBJECT_PATTERNS.some((p) => p.test(args.subject))) return true;
  const fromLower = args.fromHeader.toLowerCase();
  if (/\b(noreply|no-reply|do[-_]?not[-_]?reply|mailer[-_]?daemon|postmaster|notifications?@|newsletter@|updates@)\b/.test(fromLower))
    return true;
  return false;
}

/**
 * Given the existing contact.properties jsonb and a fresh extraction,
 * produce the property deltas to merge back.
 *
 * Pure helper — kept here (not in the runner) so tests don't need the AI SDK.
 */
export function deriveContactAttrsFromExtraction(
  existing: Record<string, unknown>,
  extraction: EmailExtraction,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.latestSentiment = extraction.sentiment;
  out.latestSentimentConfidence = extraction.sentimentConfidence;

  if (extraction.championSignals.length > 0) {
    out.championSignalCount =
      ((existing.championSignalCount as number) || 0) + 1;
  }
  if (extraction.blockerSignals.length > 0) {
    out.blockerSignalCount =
      ((existing.blockerSignalCount as number) || 0) + 1;
  }

  const existingObjections = Array.isArray(existing.objectionsMentioned)
    ? (existing.objectionsMentioned as string[])
    : [];
  const mergedObjections = Array.from(
    new Set([...existingObjections, ...extraction.objections]),
  );
  if (mergedObjections.length) out.objectionsMentioned = mergedObjections.slice(-20);

  const existingCompetitors = Array.isArray(existing.competitorsMentioned)
    ? (existing.competitorsMentioned as string[])
    : [];
  const mergedCompetitors = Array.from(
    new Set([...existingCompetitors, ...extraction.competitorsMentioned]),
  );
  if (mergedCompetitors.length) out.competitorsMentioned = mergedCompetitors.slice(-20);

  return out;
}

/**
 * Given the existing deal.properties jsonb and a fresh extraction, produce the
 * property deltas. Respects existing non-null fields (doesn't overwrite).
 */
export function deriveDealAttrsFromExtraction(
  existing: Record<string, unknown>,
  extraction: EmailExtraction,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (extraction.budgetMentioned && !existing.extractedBudget) {
    out.extractedBudget = extraction.budgetMentioned;
    out.extractedBudgetFromEmail = true;
  }
  if (extraction.timeframeMentioned && !existing.extractedTimeline) {
    out.extractedTimeline = extraction.timeframeMentioned;
  }
  if (extraction.decisionMakerMentioned && !existing.extractedDecisionMaker) {
    out.extractedDecisionMaker = extraction.decisionMakerMentioned;
  }
  if (extraction.nextSteps.length > 0) {
    const prev = Array.isArray(existing.extractedNextSteps)
      ? (existing.extractedNextSteps as unknown[])
      : [];
    out.extractedNextSteps = [...prev, ...extraction.nextSteps].slice(-10);
  }
  if (extraction.blockerSignals.length > 0) {
    const prev = Array.isArray(existing.blockers)
      ? (existing.blockers as string[])
      : [];
    out.blockers = Array.from(new Set([...prev, ...extraction.blockerSignals])).slice(-10);
  }
  return out;
}

/**
 * Derive a compact activity.intent string[] from the rich LLM extraction.
 * Keeps only up to 4 dominant signals, preserving ordering.
 */
export function deriveActivityIntent(extraction: EmailExtraction): string[] {
  const signals = new Set<string>();
  for (const i of extraction.intent) signals.add(i);
  if (extraction.objections.length > 0) signals.add("has_objection");
  if (extraction.competitorsMentioned.length > 0) signals.add("mentions_competitor");
  if (extraction.budgetMentioned) signals.add("mentions_budget");
  if (extraction.timeframeMentioned) signals.add("mentions_timeframe");
  if (extraction.championSignals.length > 0) signals.add("champion_signal");
  if (extraction.blockerSignals.length > 0) signals.add("blocker_signal");
  return Array.from(signals).slice(0, 6);
}
