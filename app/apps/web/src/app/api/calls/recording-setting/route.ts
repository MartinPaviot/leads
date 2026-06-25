/**
 * POST /api/calls/recording-setting
 *
 * Toggle the workspace opt-in for recording Call Mode conversations
 * (`tenants.settings.callRecordingEnabled`). This is layer 2 of the recording
 * gate — recording still also requires the deployment kill-switch
 * (`VOICE_RECORDING_ENABLED=true`) and, in two-party-consent regions, a
 * configured disclosure. See lib/voice/recording-policy.ts.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { updateTenantSettings } from "@/lib/config/tenant-settings";
import { logAudit } from "@/lib/infra/audit-log";
import { z } from "zod";

const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }

    await updateTenantSettings(authCtx.tenantId, {
      callRecordingEnabled: parsed.data.enabled,
    });

    // Recording is a privacy-sensitive control — leave an audit trail of who
    // flipped it and when (parity with the retention purge audit entry).
    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "update",
      entityType: "workspace_settings",
      entityId: "call_recording",
      metadata: {
        event: "call_recording_toggle",
        enabled: parsed.data.enabled,
      },
    });

    return Response.json({ ok: true, enabled: parsed.data.enabled });
  });
}
