/**
 * POST /api/calls/recording-status
 *
 * Twilio webhook. Fires twice per call:
 *   1. Status callback for the call leg (`CallStatus = completed`)
 *   2. Recording status callback (`RecordingStatus = completed`)
 *
 * Both events land on this route; we discriminate by params and
 * trigger the Inngest post-process worker once the recording is ready.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getVoiceProvider } from "@/lib/voice";
import { logger } from "@/lib/observability/logger";
import { recordCallMinutes } from "@/lib/voice/usage-cap";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  const provider = getVoiceProvider();
  if (!provider) {
    return new Response("Voice not configured", { status: 503 });
  }

  const url = new URL(req.url);
  const formText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(formText));

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }
  const publicBase =
    process.env.VOICE_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    `${url.protocol}//${url.host}`;
  const fullUrl = `${publicBase}${url.pathname}${url.search}`;
  const valid = provider.validateWebhookSignature({
    signature,
    url: fullUrl,
    params,
  });
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  const callSid = params.CallSid;
  if (!callSid) {
    return new Response("Missing CallSid", { status: 400 });
  }

  const [callRow] = await db
    .select()
    .from(calls)
    .where(eq(calls.twilioCallSid, callSid))
    .limit(1);
  if (!callRow) {
    // The webhook can race ahead of /api/calls/start in rare cases —
    // log and return 200 so Twilio doesn't retry forever.
    logger.warn?.("recording-status: call row not found", { callSid });
    return new Response("OK", { status: 200 });
  }

  // Twilio emits AMD result asynchronously — capture it as soon as we
  // see AnsweredBy, regardless of CallStatus. This is what feeds the
  // amd_detected SSE event the UI uses to surface the drop banner.
  if (params.AnsweredBy && !callRow.answeredBy) {
    await db
      .update(calls)
      .set({
        answeredBy: params.AnsweredBy,
        // Mark connected only on confirmed human; machine answers
        // never reach the AE so the "connected" semantic stays clean.
        connectedAt:
          callRow.connectedAt ??
          (params.AnsweredBy === "human" ? new Date() : null),
      })
      .where(eq(calls.id, callRow.id));
  }

  // Discriminate between call-status and recording-status callbacks.
  if (params.CallStatus === "completed" && !callRow.endedAt) {
    const durationSec = Number(params.CallDuration ?? 0);
    await db
      .update(calls)
      .set({
        endedAt: new Date(),
        durationSec,
      })
      .where(eq(calls.id, callRow.id));

    await recordCallMinutes(
      callRow.tenantId,
      durationSec,
      params.AnsweredBy === "human",
    );
  }

  if (params.RecordingStatus === "completed" && params.RecordingUrl) {
    await db
      .update(calls)
      .set({
        recordingUrl: params.RecordingUrl,
        recordingDurationSec: Number(params.RecordingDuration ?? 0),
      })
      .where(eq(calls.id, callRow.id));

    // Fire-and-forget — the post-process worker pulls the row by id.
    try {
      await inngest.send({
        name: "calls/post-process",
        data: { callId: callRow.id },
      });
    } catch (err) {
      logger.warn?.("recording-status: inngest send failed", {
        callId: callRow.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response("OK", { status: 200 });
}
