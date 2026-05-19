/**
 * POST /api/calls/[id]/voicemail-drop
 *
 * Mid-call: redirect the live Twilio leg to play a pre-recorded
 * voicemail MP3 then hang up. The MP3 source is:
 *   1. `templateId` body param → row in voicemail_templates
 *   2. env fallback VOICE_VOICEMAIL_DEFAULT_URL
 *
 * Idempotent: if voicemailDropped is already true, returns 200 without
 * re-triggering. We update the call row + activities at the same time
 * so the timeline reflects the choice even if Twilio is the slow path.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls, voicemailTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getVoiceProvider, VoiceProviderError } from "@/lib/voice";
import { buildVoicemailDropTwiml } from "@/lib/voice/twilio";
import { logger } from "@/lib/observability/logger";

const dropSchema = z.object({
  templateId: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuthRLS(async (authCtx) => {
    const provider = getVoiceProvider();
    if (!provider) {
      return Response.json(
        { error: "Voice not configured", code: "voice_not_configured" },
        { status: 503 },
      );
    }
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = dropSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Bad request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [row] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (row.voicemailDropped) {
      return Response.json({ ok: true, alreadyDropped: true });
    }
    if (!row.twilioCallSid) {
      return Response.json(
        { error: "Call not yet attached to provider", code: "no_sid" },
        { status: 409 },
      );
    }
    if (row.endedAt) {
      return Response.json(
        { error: "Call already ended", code: "ended" },
        { status: 409 },
      );
    }

    // Resolve audio URL: explicit template → tenant default → env default.
    let audioUrl: string | null = null;
    let templateId: string | null = parsed.data.templateId ?? null;
    if (templateId) {
      const [tmpl] = await db
        .select({
          audioUrl: voicemailTemplates.audioUrl,
          active: voicemailTemplates.active,
        })
        .from(voicemailTemplates)
        .where(
          and(
            eq(voicemailTemplates.id, templateId),
            eq(voicemailTemplates.tenantId, authCtx.tenantId),
          ),
        )
        .limit(1);
      if (!tmpl || !tmpl.active) {
        return Response.json(
          { error: "Template not found or inactive", code: "no_template" },
          { status: 404 },
        );
      }
      audioUrl = tmpl.audioUrl;
    }
    if (!audioUrl) {
      // Fall back to the active template flagged `default` in
      // properties — Phase 2 ships env-only; the proper default-flag
      // column lands in Phase 3 when voicemail authoring UI ships.
      audioUrl = process.env.VOICE_VOICEMAIL_DEFAULT_URL ?? null;
    }
    if (!audioUrl) {
      return Response.json(
        {
          error:
            "No voicemail template or VOICE_VOICEMAIL_DEFAULT_URL configured",
          code: "no_voicemail_source",
        },
        { status: 409 },
      );
    }

    const twiml = await buildVoicemailDropTwiml({ audioUrl });

    try {
      await provider.redirectCall(row.twilioCallSid, twiml);
    } catch (err) {
      const code =
        err instanceof VoiceProviderError ? err.code : "provider_error";
      logger.warn?.("voicemail-drop redirect failed", {
        callId: id,
        code,
        message: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        { error: "Provider redirect failed", code },
        { status: 502 },
      );
    }

    await db
      .update(calls)
      .set({
        voicemailDropped: true,
        voicemailTemplateId: templateId,
        outcome: "voicemail_left",
        updatedAt: new Date(),
      })
      .where(eq(calls.id, id));

    return Response.json({ ok: true });
  });
}
