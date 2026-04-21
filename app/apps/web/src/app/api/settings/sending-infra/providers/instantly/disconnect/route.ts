import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { getTenantSettings, updateTenantSettings } from "@/lib/tenant-settings";

/**
 * POST /api/settings/sending-infra/providers/instantly/disconnect
 *
 * Clears the stored Instantly credential and reverts the tenant's
 * sending mode to `primary-with-caps` (the safe default) when no
 * other external provider is configured. If a future provider is
 * also connected, the mode stays `external-connected`.
 */
export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const settings = await getTenantSettings(authCtx.tenantId);

  // At this stage Instantly is the only wired provider. If the user
  // disconnects, the tenant falls back to the primary-with-caps rail.
  await updateTenantSettings(authCtx.tenantId, {
    instantlyCredentialsEncrypted: undefined,
    sendingMailboxMode:
      settings.sendingMailboxMode === "external-connected"
        ? "primary-with-caps"
        : settings.sendingMailboxMode,
  });

  return NextResponse.json({
    ok: true,
    mode: "primary-with-caps",
  });
}
