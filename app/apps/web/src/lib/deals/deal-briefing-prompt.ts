/**
 * Deal-briefing PROMPT seam — the pure, DB-free core of the deal read.
 *
 * `buildDealBrief` (deal-briefing.ts) fetches from the DB then formats a
 * timeline + prompt and calls the LLM. Extracting the formatting + prompt here
 * (byte-identical) lets the deal-READ eval (lib/evals/deal-read-*) exercise the
 * EXACT prod prompt against synthetic scenarios — no DB, no drift — instead of a
 * hand-copied replica that silently rots.
 */

import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";

/** Prod model choice for the deal brief. Null when no key is configured. */
export function getDealBriefModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export interface DealBriefTimelineActivity {
  occurredAt: Date | null;
  channel: string | null;
  activityType: string | null;
  direction: string | null;
  summary: string | null;
  rawContent: string | null;
  metadata: unknown;
}

/** Format the activity timeline for the LLM (the deal read's primary evidence). */
export function formatDealTimeline(
  activities: DealBriefTimelineActivity[],
): string {
  return activities
    .map((a) => {
      const date = a.occurredAt?.toISOString().split("T")[0] ?? "unknown";
      const bodySnippet = a.rawContent ? a.rawContent.slice(0, 500) : "";
      const meta = (a.metadata || {}) as Record<string, unknown>;
      const subject = (meta.subject as string) || "";
      return `[${date}] ${a.channel}/${a.activityType} (${a.direction ?? "?"}) — ${a.summary || "no summary"}${subject ? `\n  Subject: ${subject}` : ""}${bodySnippet ? `\n  Excerpt: ${bodySnippet}` : ""}`;
    })
    .join("\n\n");
}

export interface DealBriefPromptInput {
  dealName: string;
  stage: string | null;
  value: number | string | null;
  companyName: string | null;
  contactName: string | null;
  contactTitle: string | null;
  daysInStage: number | string;
  stallBucket: string;
  dealSummary: string | null;
  activityCount: number;
  /** Pre-formatted timeline (see formatDealTimeline). */
  timeline: string;
  /** Pre-formatted knowledge-graph facts, or "None extracted". */
  graphSection: string;
  /** Pre-formatted extracted signals, or "None extracted". */
  signalSection: string;
}

/** The senior-sales-analyst deal-briefing prompt (byte-identical to prod). */
export function buildDealBriefPrompt(i: DealBriefPromptInput): string {
  return `You are a senior sales analyst producing a deal briefing. Be specific and use evidence from the timeline. Include verbatim quotes when available.

## Deal
- Name: ${i.dealName}
- Stage: ${i.stage}
- Value: ${i.value ? `$${i.value}` : "unset"}
- Company: ${i.companyName || "unknown"}
- Contact: ${i.contactName || "unknown"}${i.contactTitle ? ` (${i.contactTitle})` : ""}
- Days in current stage: ${i.daysInStage ?? "unknown"}
- Stall status: ${i.stallBucket ?? "unknown"}
- Deal summary: ${i.dealSummary || "none"}

## Activity Timeline (${i.activityCount} interactions, most recent first)
${i.timeline || "No activities recorded"}

## Knowledge Graph Facts
${i.graphSection}

## Extracted Signals from Emails
${i.signalSection}

## Your Task
Produce a structured brief with:
1. **summary**: 2-3 sentence overview of where this deal stands
2. **keyDiscussions**: The 3-5 most important conversations, with dates and topics. Include verbatim quotes if available from the excerpts.
3. **promisesMade**: Commitments made by us ("we'll send the spec by Friday") or them ("we'll review internally"). Mark fulfilled if evidence exists, null if unknown.
4. **objectionsRaised**: Concerns raised by the prospect. Status: "open" if unaddressed, "addressed" if we responded, "resolved" if they accepted.
5. **stallReason**: If the deal is stalled (>14 days in stage), explain WHY based on the evidence. null if not stalled.
6. **nextAction**: The single most important thing to do next. Be specific.
7. **healthScore**: 0-100 based on engagement, velocity, sentiment, and risk signals.
8. **riskLevel**: "low" (progressing normally), "medium" (slowing), "high" (stalled or negative signals), "critical" (likely to lose).

Do NOT let a warm, grateful, or enthusiastic tone mask a stall. A deal that has been in-stage >14 days AND is either blocked on an external gate (procurement, legal, security review, budget/CFO approval) OR has had no buyer reply to your most recent outreach is HIGH or CRITICAL risk — however friendly the last message read. Weight elapsed time and buyer silence above sentiment.

Base everything on EVIDENCE from the timeline, not assumptions.`;
}
