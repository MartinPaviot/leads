/**
 * Shared meeting-transcript writer — turns a transcript into CRM intel
 * (LLM extraction -> contact match -> activity update -> deal intel ->
 * embedding -> context graph -> post-call). The sovereign Jibri webhook uses
 * this writer. It mirrors the Recall webhook's inline processTranscriptFromBot;
 * FOLLOW-UP: migrate the Recall path onto this same function to delete the
 * remaining duplicate (kept inline for now to avoid touching the prod Recall
 * path mid-change). See _specs/sovereign-recording tasks.
 *
 * Runs server-to-server (no auth context): callers are webhooks authenticated
 * by their own signature, so this loads + mutates the activity by id directly.
 */

import { db } from "@/db";
import { activities, contacts, deals } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { summarizeMeetingTranscript } from "./summarize-transcript";

export interface ApplyTranscriptInput {
  tenantId: string;
  activityId: string;
  transcriptText: string;
  /** Provenance label stored on the activity, e.g. "recall_bot" | "jibri". */
  source: string;
  recordingUrl?: string | null;
  attendeeEmails?: string[];
  meetingTitle?: string;
  meetingDate?: string;
}

export interface ApplyTranscriptResult {
  processed: boolean;
  reason?: "activity_not_found" | "already_processed" | "too_short" | "no_llm";
}

export async function applyTranscript(
  input: ApplyTranscriptInput,
): Promise<ApplyTranscriptResult> {
  const { tenantId, activityId, transcriptText, source } = input;

  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
    .limit(1);
  if (!activity) return { processed: false, reason: "activity_not_found" };

  const meta = (activity.metadata || {}) as Record<string, unknown>;

  // Idempotency — a retried finalize must not double-process.
  if (meta.structuredNotes || meta.postCallProcessedAt) {
    return { processed: false, reason: "already_processed" };
  }

  if (transcriptText.trim().length < 50) {
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          recordingStatus: "done",
          hasTranscript: false,
          transcriptError: "Transcript too short (< 50 chars)",
        },
      })
      .where(eq(activities.id, activityId));
    return { processed: false, reason: "too_short" };
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return { processed: false, reason: "no_llm" };

  const meetingTitle =
    input.meetingTitle || (meta.title as string) || (meta.summary as string) || "Meeting";
  const meetingDate = input.meetingDate || (meta.startTime as string) || new Date().toISOString();

  const notes = await summarizeMeetingTranscript({
    transcriptText,
    model,
    meetingTitle,
    meetingDate,
    tenantId,
    traceAgentId: `apply-transcript:${source}`,
  });

  // Match participants to contacts (email first, then name).
  const attendeeEmails =
    input.attendeeEmails ??
    ((meta.attendees as Array<{ email: string }>) || []).map((a) => a.email).filter(Boolean);

  const matchedContacts: Array<{ name: string; contactId: string | null }> = [];
  for (const participant of notes.participants) {
    let contactId: string | null = null;
    for (const email of attendeeEmails) {
      const [match] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)))
        .limit(1);
      if (match) {
        contactId = match.id;
        break;
      }
    }
    if (!contactId && participant.name) {
      const nameParts = participant.name.split(" ");
      if (nameParts.length >= 2) {
        const [match] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              ilike(contacts.firstName, nameParts[0]),
              ilike(contacts.lastName, nameParts[nameParts.length - 1]),
            ),
          )
          .limit(1);
        if (match) contactId = match.id;
      }
    }
    matchedContacts.push({ name: participant.name, contactId });
  }

  // Update the activity with the processed transcript.
  const [current] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  const currentMeta = (current?.metadata || meta) as Record<string, unknown>;

  await db
    .update(activities)
    .set({
      activityType: "meeting_completed",
      summary: notes.summary,
      rawContent: transcriptText.slice(0, 10000),
      sentiment: notes.sentiment,
      metadata: {
        ...currentMeta,
        structuredNotes: notes,
        matchedContacts,
        hasTranscript: true,
        transcriptSource: source,
        transcriptLength: transcriptText.length,
        recordingStatus: "done",
        recordingUrl: input.recordingUrl ?? currentMeta.recordingUrl ?? null,
        processedAt: new Date().toISOString(),
      },
    })
    .where(eq(activities.id, activityId));

  // Update the linked deal with extracted buying signals.
  const dealId = currentMeta.dealId as string | undefined;
  if (dealId && notes.buyingSignals) {
    try {
      const [deal] = await db
        .select()
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);
      if (deal) {
        const props = (deal.properties || {}) as Record<string, unknown>;
        const extracted: Record<string, unknown> = {};
        if (notes.buyingSignals.budget) extracted.budget = notes.buyingSignals.budget;
        if (notes.buyingSignals.teamSize) extracted.teamSize = notes.buyingSignals.teamSize;
        if (notes.buyingSignals.currentStack?.length) extracted.currentTools = notes.buyingSignals.currentStack;
        if (notes.buyingSignals.competitors?.length) extracted.competitors = notes.buyingSignals.competitors;
        if (notes.buyingSignals.timeline) extracted.timeline = notes.buyingSignals.timeline;
        if (notes.buyingSignals.painPoints?.length) extracted.painPoints = notes.buyingSignals.painPoints;

        if (Object.keys(extracted).length > 0) {
          await db
            .update(deals)
            .set({
              properties: {
                ...props,
                extractedIntel: {
                  ...((props.extractedIntel || {}) as Record<string, unknown>),
                  ...extracted,
                  lastExtracted: new Date().toISOString(),
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(deals.id, dealId));
        }
      }
    } catch {
      /* non-critical */
    }
  }

  // Embed for RAG search (non-critical).
  if (process.env.OPENAI_API_KEY) {
    try {
      const { embedEntity, activityToText } = await import("@/lib/ai/embeddings");
      const activityText = activityToText({
        activityType: "meeting_completed",
        summary: notes.summary,
        rawContent: transcriptText.slice(0, 3000),
        channel: "meeting",
        direction: "internal",
        occurredAt: new Date(meetingDate),
      });
      await embedEntity(tenantId, "activity", activityId, activityText);
    } catch {
      /* non-critical */
    }
  }

  // Ingest into the context graph (non-critical).
  try {
    const { ingestEpisode } = await import("@/lib/ai/context-graph");
    const graphContent = `Meeting: ${meetingTitle}\nDate: ${meetingDate}\nParticipants: ${notes.participants
      .map((p) => p.name)
      .join(", ")}\n\nSummary: ${notes.summary}\n\nKey Points:\n${notes.keyPoints.join(
      "\n",
    )}\n\nDecisions:\n${notes.decisions.join("\n")}\n\nAction Items:\n${notes.actionItems
      .map((a) => `- ${a.owner}: ${a.task}`)
      .join("\n")}`;
    await ingestEpisode(tenantId, graphContent, "meeting", activityId);
  } catch {
    /* non-critical */
  }

  // Auto-run the post-call pipeline (tasks + follow-up DRAFT). Idempotent.
  try {
    const { processPostCall } = await import("@/lib/meetings/post-call");
    await processPostCall({ activityId, tenantId, userId: null });
  } catch (err) {
    console.error(`[apply-transcript] post-call failed for activity ${activityId}:`, err);
  }

  return { processed: true };
}
