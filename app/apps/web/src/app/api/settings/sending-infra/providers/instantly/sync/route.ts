import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { ingestInstantlyUnibox } from "@/lib/integrations/instantly-unibox";
import logger from "@/lib/observability/logger";

/**
 * POST /api/settings/sending-infra/providers/instantly/sync
 *
 * Pulls the workspace's Instantly Unibox into `email_received` activities so
 * imported boxes' replies show up in their owning rep's inbox. Idempotent.
 * Admin-only; the stored key is decrypted server-side and never returned.
 *
 * This is the manual "sync now" trigger; the 15-min cron runs the same path.
 */
export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const settings = await getTenantSettings(authCtx.tenantId);
  if (!settings.instantlyCredentialsEncrypted) {
    return NextResponse.json(
      { error: "Connect Instantly first — no API key on this workspace." },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.instantlyCredentialsEncrypted);
  } catch (err) {
    logger.error("instantly unibox sync: stored key decrypt failed", { err, tenantId: authCtx.tenantId });
    return NextResponse.json(
      { error: "Stored Instantly key couldn't be read (server key mismatch)." },
      { status: 500 },
    );
  }

  const result = await ingestInstantlyUnibox({ tenantId: authCtx.tenantId, apiKey });
  if (!result.ok) {
    logger.warn("instantly unibox sync: failed", { tenantId: authCtx.tenantId, error: result.errorMessage });
    return NextResponse.json({ error: `Unibox sync failed: ${result.errorMessage}` }, { status: 502 });
  }

  logger.info("instantly unibox sync: done", {
    tenantId: authCtx.tenantId,
    scanned: result.scanned,
    inbound: result.inbound,
    inserted: result.inserted,
  });
  return NextResponse.json(result);
}
