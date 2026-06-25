/**
 * GET /api/calls/config
 *
 * Lightweight bootstrap call for the /call-mode page: tells the client
 * whether Voice is configured for this workspace, current usage, and
 * how many pool numbers are provisioned. Avoids surfacing raw env vars.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isVoiceConfigured } from "@/lib/voice";
import { getTenantUsage } from "@/lib/voice/usage-cap";
import { getTenantSettings } from "@/lib/config/tenant-settings";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const configured = isVoiceConfigured();
    const pool = await db
      .select({
        e164: phoneNumberPool.e164,
        countryCode: phoneNumberPool.countryCode,
        areaCode: phoneNumberPool.areaCode,
      })
      .from(phoneNumberPool)
      .where(
        and(
          eq(phoneNumberPool.tenantId, authCtx.tenantId),
          eq(phoneNumberPool.active, true),
        ),
      );
    const usage = configured ? await getTenantUsage(authCtx.tenantId) : null;
    const settings = await getTenantSettings(authCtx.tenantId);
    return Response.json({
      configured,
      ready: configured && pool.length > 0,
      pool,
      usage,
      // Call recording state for the Call Mode header toggle.
      //  - available: deployment kill-switch VOICE_RECORDING_ENABLED is on.
      //  - enabled: workspace opted in (callRecordingEnabled).
      //  - disclosureConfigured: a disclosure MP3 exists — REQUIRED to record
      //    in two-party-consent markets (CH/FR), so the UI can warn when off.
      recording: {
        available: process.env.VOICE_RECORDING_ENABLED === "true",
        enabled: settings.callRecordingEnabled === true,
        disclosureConfigured: !!process.env.VOICE_DISCLOSURE_AUDIO_URL,
      },
    });
  });
}
