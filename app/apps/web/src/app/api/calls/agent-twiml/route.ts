/**
 * POST /api/calls/agent-twiml
 *
 * The Twilio TwiML-App (`TWILIO_APP_SID`) voiceUrl target. When the rep's
 * browser does `device.connect({ params: { callId, To, From } })`, Twilio
 * creates the AGENT leg and POSTs here (custom params land in the body).
 * We return TwiML that dials the prospect and bridges the two legs — so the
 * rep's microphone reaches the prospect (the two-way path that was missing) —
 * with live transcription on both tracks.
 *
 * Signature is HMAC-validated; the agent leg's CallSid is stamped onto the
 * `calls` row so the status/recording webhooks can resolve it.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildAgentTwiml, buildFallbackTwiml } from "@/lib/voice/twilio";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";
import { resolveCallRecording } from "@/lib/voice/recording-policy";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { logger } from "@/lib/observability/logger";

function xml(body: string) {
  return new Response(body, { headers: { "content-type": "text/xml" } });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const formText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(formText));

  const publicBase =
    process.env.VOICE_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    `${url.protocol}//${url.host}`;
  const fullUrl = `${publicBase}${url.pathname}${url.search}`;

  const valid = validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    url: fullUrl,
    params,
    signature: req.headers.get("x-twilio-signature"),
  });
  if (!valid) {
    logger.warn?.("calls/agent-twiml: invalid signature");
    return new Response("Invalid signature", { status: 403 });
  }

  // device.connect params (Twilio forwards them verbatim in the body).
  const callId = params.callId;
  const toNumber = params.To;
  const fromNumber = params.From;
  const agentCallSid = params.CallSid;
  if (!callId || !toNumber || !fromNumber) {
    return xml(await buildFallbackTwiml({ message: "Missing call parameters." }));
  }

  // Confirm the call row exists + belongs to a real start, and stamp the agent
  // leg SID so recording-status can resolve this call.
  const [callRow] = await db
    .select({ id: calls.id, tenantId: calls.tenantId })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);
  if (!callRow) {
    return xml(await buildFallbackTwiml({ message: "Call not found." }));
  }

  // Recording decision — deployment + workspace opt-in + a lawful disclosure.
  // The disclosure <Play> only goes into the TwiML when we will actually
  // record in a consent region, so we never announce-without-capturing nor
  // capture-without-announcing.
  const settings = await getTenantSettings(callRow.tenantId);
  const recording = resolveCallRecording({
    toNumber,
    workspaceEnabled: settings.callRecordingEnabled === true,
  });

  if (agentCallSid) {
    await db
      .update(calls)
      .set({
        twilioCallSid: agentCallSid,
        recordingConsent: recording.consent,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));
  }

  const transcriptionCallbackUrl = `${publicBase}/api/calls/transcription?callId=${callId}`;
  const dialStatusCallbackUrl = `${publicBase}/api/calls/dial-status?callId=${callId}`;
  const recordingStatusUrl = `${publicBase}/api/calls/recording-status`;

  // The disclosure is whispered TO THE PROSPECT via <Number url> (not played on
  // this agent leg, which would announce to the rep). Only when recording in a
  // consent region (recording.disclosureUrl is set).
  const disclosureWhisperUrl = recording.disclosureUrl
    ? `${publicBase}/api/calls/disclosure-whisper?u=${encodeURIComponent(recording.disclosureUrl)}`
    : undefined;

  const twiml = await buildAgentTwiml({
    toNumber,
    fromNumber,
    transcriptionCallbackUrl,
    dialStatusCallbackUrl,
    disclosureWhisperUrl,
    recordingStatusUrl,
    record: recording.record,
  });
  return xml(twiml);
}
