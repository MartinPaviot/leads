/**
 * POST /api/calls/dial-status?callId=<id>
 *
 * Status callback for the PROSPECT (child) leg of a Call Mode bridge (set on
 * the <Number> in the agent TwiML). Keyed by our `callId` in the query, so we
 * don't need to resolve a child CallSid. Stamps connectedAt when the prospect
 * answers and endedAt + duration when their leg completes — the SSE
 * /api/calls/[id]/events reads these to drive the softphone UI transitions.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";
import { recordCallMinutes } from "@/lib/voice/usage-cap";
import { recordCallOutcomeForCampaigns } from "@/lib/voice/campaign";
import { isDeadNumberErrorCode, isTerminalCallStatus } from "@/lib/voice/dead-number";
import { logger } from "@/lib/observability/logger";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  if (!callId) return new Response("Missing callId", { status: 400 });

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
    logger.warn?.("calls/dial-status: invalid signature", { callId });
    return new Response("Invalid signature", { status: 403 });
  }

  const [row] = await db
    .select({
      id: calls.id,
      tenantId: calls.tenantId,
      contactId: calls.contactId,
      userId: calls.userId,
      connectedAt: calls.connectedAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);
  if (!row) return new Response("OK", { status: 200 });

  const status = params.CallStatus;

  // Prospect answered → connected. answeredBy comes from AMD when enabled.
  if ((status === "answered" || status === "in-progress") && !row.connectedAt) {
    await db
      .update(calls)
      .set({
        connectedAt: new Date(),
        ...(params.AnsweredBy ? { answeredBy: params.AnsweredBy } : {}),
      })
      .where(eq(calls.id, row.id));
  }

  if (isTerminalCallStatus(status) && !row.endedAt) {
    const durationSec = Number(params.CallDuration ?? 0);
    await db
      .update(calls)
      .set({ endedAt: new Date(), durationSec })
      .where(eq(calls.id, row.id));
    await recordCallMinutes(row.tenantId, durationSec, params.AnsweredBy === "human");

    // Dead-number auto-detection (T7): an unambiguous invalid-number ErrorCode
    // terminates the cadence (wrong_number → exhausted) so the contact never
    // returns to a future list. A later manual disposition is then a no-op (the
    // target is already terminal) — no double-count. Anything else (busy /
    // no-answer / plain failed / SIP 404) is left to the normal miss path so a
    // good contact is never wrongly killed (R8.4: uncertain → NRP).
    if (isDeadNumberErrorCode(params.ErrorCode)) {
      await db.update(calls).set({ outcome: "wrong_number" }).where(eq(calls.id, row.id));
      await recordCallOutcomeForCampaigns({
        tenantId: row.tenantId,
        contactId: row.contactId,
        outcome: "wrong_number",
        occurredAt: new Date(),
        ownerId: row.userId,
      }).catch(() => {});
    }
  }

  return new Response("OK", { status: 200 });
}
