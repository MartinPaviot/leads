/**
 * POST /api/calls/twiml
 *
 * Twilio voice webhook. Returns the TwiML that drives the outbound
 * leg: optional disclosure prompt, Deepgram Media Stream, then dial
 * the prospect. Signature is HMAC-validated; payloads from unknown
 * senders are rejected.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getVoiceProvider } from "@/lib/voice";
import { buildTwiml } from "@/lib/voice/twilio";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";
import { logger } from "@/lib/observability/logger";

export async function POST(req: Request) {
  const provider = getVoiceProvider();
  if (!provider) {
    return new Response("Voice not configured", { status: 503 });
  }

  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  if (!callId) {
    return new Response("Missing callId", { status: 400 });
  }

  // Twilio sends form-urlencoded params. We need the full original URL
  // (incl. query) and every param to recompute the signature.
  const formText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(formText));

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  // Reconstruct the URL Twilio called us at — Twilio uses the request
  // URL exactly as configured, so we trust the public base + path.
  const publicBase =
    process.env.VOICE_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    `${url.protocol}//${url.host}`;
  const fullUrl = `${publicBase}${url.pathname}${url.search}`;

  // Self-contained HMAC validation — independent of whether the Twilio SDK
  // module happens to be warm on this serverless instance.
  const valid = validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    url: fullUrl,
    params,
    signature,
  });
  if (!valid) {
    logger.warn?.("calls/twiml: invalid signature", { callId });
    return new Response("Invalid signature", { status: 403 });
  }

  const [callRow] = await db
    .select()
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);
  if (!callRow) {
    return new Response("Call not found", { status: 404 });
  }

  // Twilio-native real-time transcription POSTs transcript events to this
  // webhook (serverless — no Media Streams WS server to host). callId is
  // carried so the webhook writes to the right calls row.
  const transcriptionCallbackUrl = `${publicBase}/api/calls/transcription?callId=${callId}`;
  // Romand wedge: prospects are FR/CH francophone → French transcription.
  const languageCode = "fr-FR";

  const disclosureUrl = url.searchParams.get("disclosureUrl") ?? undefined;
  const recordingStatusUrl = `${publicBase}/api/calls/recording-status`;

  const twiml = await buildTwiml({
    toNumber: callRow.toNumber,
    fromNumber: callRow.fromNumber,
    transcriptionCallbackUrl,
    languageCode,
    disclosureUrl,
    recordingStatusUrl,
  });

  // Mark the moment Twilio actually reached our webhook — this is the
  // earliest reliable timestamp for "ringing started" without trusting
  // the status callback to land first.
  await db
    .update(calls)
    .set({ updatedAt: new Date() })
    .where(eq(calls.id, callId));

  return new Response(twiml, {
    headers: { "content-type": "text/xml" },
  });
}
