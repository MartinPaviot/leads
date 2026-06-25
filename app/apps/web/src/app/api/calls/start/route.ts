/**
 * POST /api/calls/start
 *
 * Reserves a `calls` row, picks a `from` number from the tenant pool,
 * checks DNC + quiet hours + usage cap, then asks the provider to
 * place the outbound leg. Returns the call id + a capability JWT the
 * browser uses with the Twilio Voice SDK.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls, contacts } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getVoiceProvider, VoiceProviderError } from "@/lib/voice";
import { isOnDnc } from "@/lib/voice/dnc";
import {
  parseE164,
  requiresTwoPartyConsent,
  resolveFromNumber,
} from "@/lib/voice/number-selector";
import { resolveCallRecording } from "@/lib/voice/recording-policy";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { checkQuietHours, resolveTimezone } from "@/lib/voice/quiet-hours";
import { getTenantUsage } from "@/lib/voice/usage-cap";
import { logger } from "@/lib/observability/logger";

const startSchema = z.object({
  contactId: z.string(),
  dealId: z.string().optional(),
  enrollmentId: z.string().optional(),
  overrideQuietHours: z.boolean().optional(),
  // Explicit outbound number chosen by the rep in Call Mode. When absent,
  // we fall back to local-presence auto-selection.
  fromNumber: z.string().optional(),
  // What the script panel showed at dial time (lib/voice/script-context.ts) —
  // stamped on the call so outcomes can be segmented by script variant.
  // Strict + size-capped: this is client input.
  scriptContext: z
    .object({
      reasonSource: z.enum(["signal", "hiring", "funding"]).nullable(),
      matchedEnjeu: z.boolean(),
      viaTool: z.boolean(),
      tool: z.string().trim().max(80).nullable(),
      sector: z.string().trim().max(40).nullable().optional(),
      enjeuKey: z.string().trim().max(40).nullable().optional(),
    })
    .strict()
    .optional(),
});

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const provider = getVoiceProvider();
    if (!provider) {
      return Response.json(
        {
          error:
            "Voice not configured for this workspace. Add Twilio credentials in Settings → Voice.",
          code: "voice_not_configured",
        },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Bad request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // 1. Contact must exist, must have a phone, must belong to tenant
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.tenantId, authCtx.tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }
    if (!contact.phone) {
      return Response.json(
        { error: "Contact has no phone number", code: "no_phone" },
        { status: 409 },
      );
    }

    // 2. DNC
    const dnc = await isOnDnc(authCtx.tenantId, contact.phone);
    if (dnc.blocked) {
      return Response.json(
        {
          error: "Contact is on the Do-Not-Call list",
          code: "dnc",
          reason: dnc.reason,
        },
        { status: 409 },
      );
    }

    // 3. Quiet hours (unless explicitly overridden by the user)
    const parsedPhone = parseE164(contact.phone);
    const cprops = (contact.properties as { timezone?: string } | null) ?? {};
    const tz = resolveTimezone(cprops.timezone, parsedPhone.countryCode);
    const qh = checkQuietHours(new Date(), tz);
    if (qh.inQuietHours && !input.overrideQuietHours) {
      return Response.json(
        {
          error: "Outside quiet hours for this contact's timezone",
          code: "quiet_hours",
          localTime: qh.localTime,
          timezone: tz,
          nextWindowOpensAt: qh.nextWindowOpensAt?.toISOString(),
        },
        { status: 409 },
      );
    }

    // 4. Usage cap
    const usage = await getTenantUsage(authCtx.tenantId);
    if (usage.hardCeilingReached) {
      return Response.json(
        {
          error: "Monthly voice usage hard ceiling reached",
          code: "usage_cap",
          minutesUsed: usage.minutesUsed,
          hardCeiling: usage.hardCeiling,
        },
        { status: 429 },
      );
    }

    // 5. Pick a from number from the tenant pool. An explicit choice from
    // Call Mode wins as long as it's an active pool number for this tenant;
    // otherwise fall back to local-presence auto-selection.
    const resolved = await resolveFromNumber(
      authCtx.tenantId,
      contact.phone,
      input.fromNumber,
    );
    if (!resolved.ok) {
      return resolved.reason === "invalid_override"
        ? Response.json(
            {
              error: "The chosen number isn't in your active pool.",
              code: "invalid_from_number",
            },
            { status: 409 },
          )
        : Response.json(
            {
              error:
                "No outbound number provisioned. Buy one in Settings → Voice.",
              code: "no_pool_number",
            },
            { status: 503 },
          );
    }
    const fromNumber = { e164: resolved.e164 };

    // 6. Two-party-consent region?
    const requiresConsent = requiresTwoPartyConsent(contact.phone);

    // 6b. Recording decision — deployment + workspace opt-in + a lawful
    // disclosure. Resolved here (same policy the agent-twiml webhook re-runs)
    // so the consent stamp on the row and the live "recording" indicator the
    // browser shows agree with the TwiML that will actually play.
    const settings = await getTenantSettings(authCtx.tenantId);
    const recording = resolveCallRecording({
      toNumber: contact.phone,
      workspaceEnabled: settings.callRecordingEnabled === true,
    });

    // 7. Insert the call row so it survives any provider failure
    const [callRow] = await db
      .insert(calls)
      .values({
        tenantId: authCtx.tenantId,
        contactId: contact.id,
        userId: authCtx.appUserId,
        dealId: input.dealId,
        enrollmentId: input.enrollmentId,
        fromNumber: fromNumber.e164,
        toNumber: contact.phone,
        twoPartyConsentRegion: requiresConsent,
        recordingConsent: recording.consent,
        scriptContext: input.scriptContext ?? null,
      })
      .returning({ id: calls.id });

    // 8. Issue the capability token. We do NOT place the prospect call here:
    // the rep's browser (Twilio Voice SDK) connects as the AGENT leg, and the
    // App-SID voiceUrl (/api/calls/agent-twiml) dials the prospect and bridges
    // the two — so the rep's mic reaches the prospect. The disclosure +
    // record decision are re-resolved there from the live params.
    try {
      const token = await provider.signWebRtcToken({
        userId: authCtx.appUserId,
        tenantId: authCtx.tenantId,
      });

      return Response.json({
        callId: callRow.id,
        capabilityToken: token.jwt,
        identity: token.identity,
        fromNumber: fromNumber.e164,
        toNumber: contact.phone,
        twoPartyConsentRegion: requiresConsent,
        recordingConsentRequired: requiresConsent,
        // Whether THIS call will be recorded — drives the live indicator in
        // Call Mode (no separate fetch needed).
        recording: recording.record,
      });
    } catch (err) {
      const code =
        err instanceof VoiceProviderError ? err.code : "provider_error";
      logger.warn?.("calls/start token failure", {
        callId: callRow.id,
        code,
        message: err instanceof Error ? err.message : String(err),
      });
      await db
        .update(calls)
        .set({ outcome: "failed", processingState: "failed" })
        .where(eq(calls.id, callRow.id));
      return Response.json(
        { error: "Could not start the call", code },
        { status: 502 },
      );
    }
  });
}
