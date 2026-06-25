/**
 * POST /api/calls/disclosure-whisper?u=<encoded mp3 url>
 *
 * <Number url> whisper target for the bridged Call Mode call. Twilio fetches
 * this on the PROSPECT leg when they answer, before bridging, so the prospect
 * hears the recording disclosure (two-party consent — CH/FR). Returns a single
 * <Play>; control then returns to the parent <Dial> and the legs bridge.
 *
 * Signature is HMAC-validated. The audio URL is passed as the `u` query param
 * (it's the public disclosure MP3, not a secret) and validated against the
 * configured `VOICE_DISCLOSURE_AUDIO_URL` so a forged request can't make us
 * play arbitrary audio to a prospect.
 */

import { buildDisclosureWhisperTwiml } from "@/lib/voice/twilio";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";
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
    logger.warn?.("calls/disclosure-whisper: invalid signature");
    return new Response("Invalid signature", { status: 403 });
  }

  // Only ever play the workspace's configured disclosure — never arbitrary
  // audio from the query string.
  const configured = process.env.VOICE_DISCLOSURE_AUDIO_URL;
  const requested = url.searchParams.get("u");
  if (!configured || requested !== configured) {
    // Nothing valid to announce → empty response; the <Dial> just bridges.
    return xml("<Response/>");
  }

  return xml(await buildDisclosureWhisperTwiml({ audioUrl: configured }));
}
