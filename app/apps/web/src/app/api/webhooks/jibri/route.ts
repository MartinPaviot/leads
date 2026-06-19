/**
 * Sovereign recording webhook — Jibri (self-hosted Jitsi recorder) calls this
 * after it records a visio room. It mirrors the Recall webhook but keeps the
 * prospect's voice on our infrastructure: the audio lives on our host and the
 * transcript is produced by our STT seam (self-hostable via WHISPER_BASE_URL),
 * then fed into the SAME meeting-intel writer (applyTranscript).
 *
 * Security: fail-closed on a missing JIBRI_WEBHOOK_SECRET (503) and on a bad
 * signature (401) — the route mutates tenant-owned activities/deals. Gated by
 * SOVEREIGN_RECORDING_ENABLED so it is inert until the infra exists.
 */

import { db } from "@/db";
import { activities, meetingOptOuts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  jibriEventSchema,
  verifyJibriSignature,
  isSovereignRecordingEnabled,
} from "@/lib/recording/sovereign-recording";
import { transcribeFromUrl } from "@/lib/integrations/transcribe";
import { applyTranscript } from "@/lib/meetings/apply-transcript";

// Transcription + LLM extraction can take a while; give the function room.
export const maxDuration = 300;

/** Strip WebVTT/SRT cue markers down to plain text (same shape as upload-transcript). */
function parseVtt(content: string): string {
  return content
    .replace(/WEBVTT\n/g, "")
    .replace(/\d+\n/g, "")
    .replace(/[\d:.,-]+\s*-->\s*[\d:.,-]+\n?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!isSovereignRecordingEnabled()) {
    return Response.json({ error: "Sovereign recording disabled" }, { status: 404 });
  }

  const secret = process.env.JIBRI_WEBHOOK_SECRET;
  if (!secret) {
    console.error("webhooks/jibri: JIBRI_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (!verifyJibriSignature(rawBody, req.headers.get("x-jibri-signature"), secret)) {
    console.warn("webhooks/jibri: rejected request with invalid signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = jibriEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  const event = parsed.data;

  // Resolve the meeting activity by its Jitsi room name (unguessable, unique).
  const [activity] = await db
    .select()
    .from(activities)
    .where(sql`metadata->>'roomName' = ${event.roomName}`)
    .limit(1);
  if (!activity) {
    console.warn(`[Jibri webhook] no activity for room ${event.roomName}`);
    return Response.json({ received: true, warning: "no matching activity" });
  }
  const meta = (activity.metadata || {}) as Record<string, unknown>;

  if (event.status === "started") {
    await db
      .update(activities)
      .set({ metadata: { ...meta, recordingStatus: "recording" } })
      .where(eq(activities.id, activity.id));
    return Response.json({ received: true, status: "recording" });
  }

  if (event.status === "failed") {
    await db
      .update(activities)
      .set({ metadata: { ...meta, recordingStatus: "error", transcriptError: "Jibri reported failure" } })
      .where(eq(activities.id, activity.id));
    return Response.json({ received: true, status: "error" });
  }

  // status === "finalized"
  // Consent gate: if any attendee opted out, do not process the recording.
  const optOut = await db
    .select({ activityId: meetingOptOuts.activityId })
    .from(meetingOptOuts)
    .where(eq(meetingOptOuts.activityId, activity.id))
    .limit(1);
  if (optOut.length > 0) {
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          recordingStatus: "skipped",
          recordingSkipped: { reason: "attendee_opted_out", at: new Date().toISOString() },
        },
      })
      .where(eq(activities.id, activity.id));
    return Response.json({ received: true, status: "skipped_opt_out" });
  }

  // Obtain a transcript: a provided VTT, else transcribe the recorded audio
  // through our STT seam (self-hostable). Never throw out of the webhook.
  let transcriptText = "";
  try {
    if (event.transcriptVtt) {
      transcriptText = parseVtt(event.transcriptVtt);
    } else if (event.audioUrl) {
      transcriptText = await transcribeFromUrl(event.audioUrl);
    } else {
      return Response.json({ error: "No transcript or audio provided" }, { status: 400 });
    }
  } catch (err) {
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          recordingStatus: "transcription_failed",
          recordingUrl: event.audioUrl ?? (meta.recordingUrl as string | undefined) ?? null,
          transcriptError: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(activities.id, activity.id));
    return Response.json({ received: true, status: "transcription_failed" });
  }

  const result = await applyTranscript({
    tenantId: activity.tenantId,
    activityId: activity.id,
    transcriptText,
    source: "jibri",
    recordingUrl: event.audioUrl ?? null,
    attendeeEmails: ((meta.attendees as Array<{ email: string }>) || [])
      .map((a) => a.email)
      .filter(Boolean),
    meetingTitle: (meta.title as string) || (meta.summary as string) || undefined,
    meetingDate: (meta.startTime as string) || undefined,
  });

  return Response.json({ received: true, processed: result.processed, reason: result.reason });
}
