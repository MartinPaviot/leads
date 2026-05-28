import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { activities, contacts, companies, deals } from "@/db/schema";
import { eq, and, ilike, or, isNull } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { embedEntity, activityToText } from "@/lib/ai/embeddings";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { indexTranscript } from "@/lib/coaching/index-transcript";
import { logger } from "@/lib/observability/logger";
import { llmCall } from "@/lib/ai/llm-call";

const meetingNotesSchema = z.object({
  summary: z.string().describe("2-3 sentence meeting summary"),
  keyPoints: z.array(z.string()).describe("Key discussion points"),
  actionItems: z.array(
    z.object({
      owner: z.string().describe("Person responsible"),
      task: z.string().describe("Action item description"),
      deadline: z.string().nullable().describe("Deadline if mentioned"),
    })
  ),
  decisions: z.array(z.string()).describe("Decisions made during the meeting"),
  participants: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
    })
  ),
  buyingSignals: z.object({
    budget: z.string().nullable().describe("Budget mentions or constraints"),
    timeline: z.string().nullable().describe("Decision timeline mentioned"),
    currentStack: z.array(z.string()).describe("Current tools/vendors mentioned"),
    painPoints: z.array(z.string()).describe("Pain points or challenges mentioned"),
    objections: z.array(z.string()).describe("Objections raised"),
    nextSteps: z.array(z.string()).describe("Agreed next steps"),
    competitors: z.array(z.string()).describe("Competitor names mentioned"),
    teamSize: z.string().nullable().describe("Team size if mentioned"),
  }),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall meeting sentiment"),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { transcript, meetingTitle, meetingDate, attendeeEmails, activityId, dealId } = body;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 50) {
      return Response.json({ error: "Transcript required (min 50 characters)" }, { status: 400 });
    }

    // Extract structured notes from transcript. Wrapped in llmCall
    // so cost / latency / retries / fallback flow into `llm_calls`
    // for the Sprint-1 admin dashboard. Anthropic primary, OpenAI
    // gpt-4o-mini fallback when Anthropic errors terminally.
    const isPrimaryAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const { object: rawNotes } = (await llmCall({
      fn: tracedGenerateObject,
      args: [{
        model,
        schema: meetingNotesSchema,
        prompt: `Analyze this meeting transcript and extract structured notes.

MEETING: ${meetingTitle || "Untitled Meeting"}
DATE: ${meetingDate || "Unknown"}

TRANSCRIPT:
${transcript.slice(0, 15000)}

RULES:
- Extract ONLY information explicitly stated in the transcript
- Do NOT invent or assume any information not in the transcript
- For buying signals, only include if explicitly mentioned
- Set fields to null/empty if not discussed
- Be specific with action items — include who and what`,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        _trace: { agentId: "process-transcript", tenantId: authCtx.tenantId },
      }] as never,
      fallbackModel: isPrimaryAnthropic ? openai("gpt-4o-mini") : undefined,
      retries: 1,
      timeoutMs: 60_000,
      trace: {
        tenantId: authCtx.tenantId,
        surfaceId: "process-transcript",
        promptId: "meeting-notes-extraction.v1",
        metadata: { agentId: "process-transcript", activityId, dealId },
      },
    })) as { object: z.infer<typeof meetingNotesSchema> };
    const notes = rawNotes as any;

    // Try to match participants to existing contacts
    const matchedContacts: Array<{ name: string; contactId: string | null }> = [];
    for (const participant of notes.participants) {
      // Try to match by email if provided
      let contactId: string | null = null;
      if (attendeeEmails?.length) {
        for (const email of attendeeEmails) {
          const [match] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.tenantId, authCtx.tenantId),
                eq(contacts.email, email),
                isNull(contacts.deletedAt)
              )
            )
            .limit(1);
          if (match) {
            contactId = match.id;
            break;
          }
        }
      }

      // Try to match by name
      if (!contactId && participant.name) {
        const nameParts = participant.name.split(" ");
        if (nameParts.length >= 2) {
          const [match] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.tenantId, authCtx.tenantId),
                ilike(contacts.firstName, nameParts[0]),
                ilike(contacts.lastName, nameParts[nameParts.length - 1]),
                isNull(contacts.deletedAt)
              )
            )
            .limit(1);
          if (match) contactId = match.id;
        }
      }

      matchedContacts.push({ name: participant.name, contactId });
    }

    // Save as activity if activityId provided (update existing meeting activity)
    let resolvedMeetingId: string | null = activityId ?? null;
    if (activityId) {
      await db
        .update(activities)
        .set({
          summary: notes.summary,
          sentiment: notes.sentiment,
          metadata: {
            structuredNotes: notes,
            matchedContacts,
            transcriptLength: transcript.length,
            processedAt: new Date().toISOString(),
          },
        })
        .where(
          and(
            eq(activities.id, activityId),
            eq(activities.tenantId, authCtx.tenantId),
            isNull(activities.deletedAt)
          )
        );
    } else {
      // Create a new meeting activity
      // Find entity to link to (first matched contact, or their company)
      let entityType = "contact";
      let entityId = matchedContacts.find((c) => c.contactId)?.contactId || "";

      if (!entityId && matchedContacts.length > 0) {
        entityType = "contact";
        entityId = "";
      }

      const [insertedActivity] = await db.insert(activities).values({
        tenantId: authCtx.tenantId,
        actorType: "user",
        actorId: authCtx.appUserId,
        entityType,
        entityId: entityId || "unknown",
        activityType: "meeting_completed",
        channel: "meeting",
        direction: "internal",
        occurredAt: meetingDate ? new Date(meetingDate) : new Date(),
        summary: notes.summary,
        rawContent: transcript.slice(0, 10000),
        sentiment: notes.sentiment,
        metadata: {
          title: meetingTitle,
          structuredNotes: notes,
          matchedContacts,
          transcriptLength: transcript.length,
          processedAt: new Date().toISOString(),
        },
      }).returning({ id: activities.id });
      resolvedMeetingId = insertedActivity?.id ?? null;
    }

    // MONACO-PARITY-05: index the transcript into transcript_chunks
    // for RAG coaching. Fire-and-forget — failure to index never
    // blocks the user response. The chunks may take a few seconds
    // to land if the embedding API is slow.
    if (resolvedMeetingId) {
      indexTranscript({
        tenantId: authCtx.tenantId,
        meetingId: resolvedMeetingId,
        rawText: transcript,
        // No segment-level data here — process-transcript receives
        // a flat string. When Recall.ai ships speaker-diarized
        // segments, they should pass `segments` instead and the
        // chunker switches automatically.
        totalDurationSec: 0, // unknown from this entry point
        source: "manual_paste",
      }).catch((err) => {
        logger.warn("process-transcript: indexTranscript failed", {
          tenantId: authCtx.tenantId,
          meetingId: resolvedMeetingId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // S9: Auto-update deal with extracted structured data
    if (dealId && notes.buyingSignals) {
      try {
        const [deal] = await db.select().from(deals)
          .where(and(eq(deals.id, dealId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt))).limit(1);
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
            await db.update(deals).set({
              properties: {
                ...props,
                extractedIntel: {
                  ...((props.extractedIntel || {}) as Record<string, unknown>),
                  ...extracted,
                  lastExtracted: new Date().toISOString(),
                },
              },
              updatedAt: new Date(),
            }).where(and(eq(deals.id, dealId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Embed the processed transcript for RAG search
    if (process.env.OPENAI_API_KEY) {
      try {
        const activityText = activityToText({
          activityType: "meeting_completed",
          summary: notes.summary,
          rawContent: transcript.slice(0, 3000),
          channel: "meeting",
          direction: "internal",
          occurredAt: meetingDate ? new Date(meetingDate) : new Date(),
        });
        const targetId = activityId || `transcript-${Date.now()}`;
        await embedEntity(authCtx.tenantId, "activity", targetId, activityText);
      } catch {
        // Non-critical embedding failure
      }
    }

    // Ingest into context graph (async, non-blocking)
    if (transcript.length > 50) {
      const graphContent = `Meeting: ${meetingTitle || "Untitled"}\nDate: ${meetingDate || new Date().toISOString()}\nParticipants: ${notes.participants.map((p: any) => p.name).join(", ")}\n\nSummary: ${notes.summary}\n\nKey Points:\n${notes.keyPoints.join("\n")}\n\nDecisions:\n${notes.decisions.join("\n")}\n\nAction Items:\n${notes.actionItems.map((a: any) => `- ${a.owner}: ${a.task}`).join("\n")}`;
      ingestEpisode(authCtx.tenantId, graphContent, "meeting", activityId || `meeting-${Date.now()}`)
        .catch((e) => console.warn("meetings/process-transcript: ingestEpisode failed (non-blocking)", e));
    }

    return Response.json({
      success: true,
      notes,
      matchedContacts,
    });
  } catch (error) {
    console.error("Transcript processing failed:", error);
    return Response.json({ error: "Transcript processing failed" }, { status: 500 });
  }
}
