import { db } from "@/db";
import { activities, contacts, companies, deals } from "@/db/schema";
import { eq, and, sql, ilike } from "drizzle-orm";
import { getBotStatus, getBotTranscript, transcriptToText, mapBotStatus, recallSegmentsToChunkSegments } from "@/lib/integrations/recall";
import { indexTranscript } from "@/lib/coaching/index-transcript";
import { createHmac, timingSafeEqual } from "node:crypto";
import { summarizeMeetingTranscript } from "@/lib/meetings/summarize-transcript";

/**
 * Verify a Recall.ai webhook signature.
 *
 * Recall.ai delivers webhooks via Svix — canonical message is
 *   `${svix-id}.${svix-timestamp}.${rawBody}`
 * signed with HMAC-SHA256 using a `whsec_<base64>` secret. The header
 * `svix-signature` carries one or more `v1,<base64>` signatures.
 *
 * Fail-closed: if `RECALL_WEBHOOK_SECRET` is not configured, all
 * requests are rejected with 503. This is deliberate — a silent accept
 * in non-prod would let a preview deploy be abused to corrupt real
 * tenant data (the route mutates `activities` and `deals` once it
 * resolves a `recallBotId`).
 */
function verifyRecallSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) return false;

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatureHeader = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");

  const toSign = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  const candidates = signatureHeader
    .split(" ")
    .filter((p) => p.startsWith("v1,"))
    .map((p) => p.slice("v1,".length));

  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Webhook handler                                                    */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const rawBody = await req.text();

  // Verify signature BEFORE parsing or touching the DB — the route
  // mutates tenant-owned rows as soon as it resolves `recallBotId`, so
  // any path that reaches the parse step with an unauthenticated body
  // is a data-integrity hole.
  if (!process.env.RECALL_WEBHOOK_SECRET) {
    console.error("webhooks/recall: RECALL_WEBHOOK_SECRET is not configured");
    return Response.json(
      { error: "Webhook not configured" },
      { status: 503 }
    );
  }
  if (!verifyRecallSignature(req, rawBody)) {
    console.warn("webhooks/recall: rejected request with invalid signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the event
  let event: { event: string; data: { data: { code: string; sub_code: string | null; updated_at: string }; bot: { id: string; metadata: Record<string, unknown> } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const botId = event.data?.bot?.id;
  if (!botId) {
    return Response.json({ error: "Missing bot ID" }, { status: 400 });
  }

  console.log(`[Recall webhook] event=${event.event} bot=${botId} code=${event.data?.data?.code}`);

  // Find the meeting activity linked to this bot
  const [activity] = await db
    .select()
    .from(activities)
    .where(sql`metadata->>'recallBotId' = ${botId}`)
    .limit(1);

  if (!activity) {
    console.warn(`[Recall webhook] No activity found for bot ${botId}`);
    return Response.json({ received: true, warning: "no matching activity" });
  }

  const meta = (activity.metadata || {}) as Record<string, unknown>;
  const statusCode = event.data?.data?.code;

  // Handle bot status changes
  if (event.event === "bot.status_change") {
    const mappedStatus = mapBotStatus(statusCode);

    await db
      .update(activities)
      .set({
        metadata: { ...meta, recordingStatus: mappedStatus, lastStatusUpdate: event.data.data.updated_at },
      })
      .where(eq(activities.id, activity.id));

    // If the call ended, trigger transcript fetch
    if (statusCode === "call_ended" || statusCode === "done") {
      // Process transcript asynchronously — don't block the webhook response
      processTranscriptFromBot(botId, activity.id, activity.tenantId, meta).catch((err) => {
        console.error(`[Recall webhook] Transcript processing failed for bot ${botId}:`, err);
      });
    }

    return Response.json({ received: true, status: mappedStatus });
  }

  // Handle live transcription updates during active call
  if (event.event === "bot.transcription" || event.event === "bot.transcript") {
    // Recall.ai sends `words` or `transcript` payloads on transcription
    // events; the typed envelope only exposes status fields, so we cast
    // through `unknown` to read the dynamic transcript shape.
    const transcriptData = (event.data as { data?: { words?: unknown; transcript?: unknown } } | undefined)?.data;
    const words = transcriptData?.words ?? transcriptData?.transcript ?? "";
    const partialTranscript = (meta.partialTranscript as string || "") + " " + (typeof words === "string" ? words : JSON.stringify(words));

    // Store partial transcript
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          partialTranscript: partialTranscript.slice(-10000), // Keep last 10K chars
          lastTranscriptUpdate: new Date().toISOString(),
          recordingStatus: "recording",
        },
      })
      .where(eq(activities.id, activity.id));

    return Response.json({ received: true, event: "transcription_update" });
  }

  // For any other event, just acknowledge
  return Response.json({ received: true });
}

/* ------------------------------------------------------------------ */
/*  Transcript processing (runs async after webhook response)          */
/* ------------------------------------------------------------------ */

async function processTranscriptFromBot(
  botId: string,
  activityId: string,
  tenantId: string,
  existingMeta: Record<string, unknown>
) {
  // 1. Fetch transcript + recording URL from Recall.ai
  let transcriptText: string;
  let recordingUrl: string | null = null;
  // Hoisted so the speaker-aware segments survive to the RAG-indexing step below.
  let botSegments: Awaited<ReturnType<typeof getBotTranscript>> = [];
  try {
    // Get bot details for recording URL
    const botDetails = await getBotStatus(botId);
    const recording = botDetails.recordings?.[0];
    recordingUrl = recording?.media_shortcuts?.video_mixed?.data?.download_url || null;

    const segments = await getBotTranscript(botId);
    botSegments = segments;
    transcriptText = transcriptToText(segments);
  } catch (err) {
    console.error(`[Recall] Failed to fetch transcript for bot ${botId}:`, err);
    await db
      .update(activities)
      .set({ metadata: { ...existingMeta, recordingStatus: "error", transcriptError: String(err) } })
      .where(eq(activities.id, activityId));
    return;
  }

  if (transcriptText.trim().length < 50) {
    console.warn(`[Recall] Transcript too short for bot ${botId}: ${transcriptText.length} chars`);
    await db
      .update(activities)
      .set({
        metadata: {
          ...existingMeta,
          recordingStatus: "done",
          hasTranscript: false,
          transcriptError: "Transcript too short (< 50 chars)",
        },
      })
      .where(eq(activities.id, activityId));
    return;
  }

  // 2. Extract structured notes via LLM
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { openai } = await import("@ai-sdk/openai");

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    console.error("[Recall] No LLM configured for transcript processing");
    return;
  }

  const meetingTitle = (existingMeta.summary as string) || "Meeting";
  const meetingDate = (existingMeta.startTime as string) || new Date().toISOString();

  const notes = await summarizeMeetingTranscript({
    transcriptText,
    model,
    meetingTitle,
    meetingDate,
    tenantId,
    traceAgentId: "recall-transcript-processing",
  });

  // 3. Match participants to contacts
  const attendeeEmails = ((existingMeta.attendees as Array<{ email: string }>) || []).map((a) => a.email).filter(Boolean);

  const matchedContacts: Array<{ name: string; contactId: string | null }> = [];
  for (const participant of notes.participants) {
    let contactId: string | null = null;

    // Try email match from calendar attendees
    for (const email of attendeeEmails) {
      const [match] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)))
        .limit(1);
      if (match) { contactId = match.id; break; }
    }

    // Try name match
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
              ilike(contacts.lastName, nameParts[nameParts.length - 1])
            )
          )
          .limit(1);
        if (match) contactId = match.id;
      }
    }

    matchedContacts.push({ name: participant.name, contactId });
  }

  // 4. Update the activity with processed transcript
  const [currentActivity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  const currentMeta = (currentActivity?.metadata || existingMeta) as Record<string, unknown>;

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
        transcriptSource: "recall_bot",
        transcriptLength: transcriptText.length,
        recordingStatus: "done",
        recordingUrl,
        processedAt: new Date().toISOString(),
      },
    })
    .where(eq(activities.id, activityId));

  // 5. Update deal if linked
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
          }).where(eq(deals.id, dealId));
        }
      }
    } catch { /* non-critical */ }
  }

  // 6. Embed for RAG search
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
    } catch { /* non-critical */ }
  }

  // 6b. Index the FULL transcript into transcript_chunks (pgvector), speaker- and
  // timestamp-aware, exactly like the calls path (indexTranscript, source
  // "cold_call"). Until now only the ~3k-char head reached RAG via embedEntity;
  // long meetings lost their middle + tail. Idempotent (wipes prior chunks for
  // this meeting) + fail-soft. rawText is the fallback when segments are empty.
  try {
    await indexTranscript({
      tenantId,
      meetingId: activityId,
      segments: recallSegmentsToChunkSegments(botSegments),
      rawText: transcriptText,
      source: "recall_bot",
    });
  } catch (e) {
    console.warn(`[Recall] indexTranscript failed for activity ${activityId} (non-blocking)`, e);
  }

  // 7. Ingest to context graph
  try {
    const { ingestEpisode } = await import("@/lib/ai/context-graph");
    const graphContent = `Meeting: ${meetingTitle}\nDate: ${meetingDate}\nParticipants: ${notes.participants.map((p) => p.name).join(", ")}\n\nSummary: ${notes.summary}\n\nKey Points:\n${notes.keyPoints.join("\n")}\n\nDecisions:\n${notes.decisions.join("\n")}\n\nAction Items:\n${notes.actionItems.map((a) => `- ${a.owner}: ${a.task}`).join("\n")}`;
    await ingestEpisode(tenantId, graphContent, "meeting", activityId);
  } catch { /* non-critical */ }

  // 8. Auto-run the post-call pipeline (tasks from action items + follow-up
  // DRAFT) so a recorded meeting is captured without a manual "Confirm & update
  // CRM" click. userId=null -> tasks are created unassigned. Idempotent (the
  // meta.postCallProcessedAt guard), so a later manual confirm is a no-op.
  // Drafts the follow-up only — never sends.
  try {
    const { processPostCall } = await import("@/lib/meetings/post-call");
    const pc = await processPostCall({ activityId, tenantId, userId: null });
    console.log(`[Recall] post-call auto-run for activity ${activityId}: ${pc.tasks} task(s), draft=${pc.followUpDraft ? "yes" : "no"}`);
  } catch (err) {
    console.error(`[Recall] post-call auto-run failed for activity ${activityId}:`, err);
  }

  console.log(`[Recall] Transcript processed for bot ${botId}, activity ${activityId}: ${notes.summary.slice(0, 100)}`);
}
