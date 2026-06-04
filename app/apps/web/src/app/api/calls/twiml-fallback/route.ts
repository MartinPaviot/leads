/**
 * POST /api/calls/twiml-fallback
 *
 * Twilio Voice "Fallback URL" — hit ONLY when the primary
 * /api/calls/twiml webhook errors or times out. Deliberately bulletproof:
 * no DB, no signature gate (the response is a constant, side-effect-free
 * apology + hangup), so a primary failure degrades politely instead of
 * Twilio's default error tone. Even the SDK builder failing falls back to
 * static XML.
 */

import { buildFallbackTwiml } from "@/lib/voice/twilio";
import { logger } from "@/lib/observability/logger";

const STATIC_FALLBACK =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="fr-FR">Nous rencontrons un incident technique. Nous vous recontacterons rapidement. Merci.</Say><Hangup/></Response>';

export async function POST(req: Request) {
  const callId = new URL(req.url).searchParams.get("callId");
  logger.warn?.("calls/twiml-fallback fired", { callId });
  try {
    const twiml = await buildFallbackTwiml();
    return new Response(twiml, { headers: { "content-type": "text/xml" } });
  } catch (err) {
    logger.error?.("calls/twiml-fallback builder failed, using static XML", {
      callId,
      message: err instanceof Error ? err.message : String(err),
    });
    return new Response(STATIC_FALLBACK, { headers: { "content-type": "text/xml" } });
  }
}
