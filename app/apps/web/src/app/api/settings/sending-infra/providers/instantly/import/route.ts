import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { importInstantlyMailboxes } from "@/lib/integrations/instantly-import";
import logger from "@/lib/observability/logger";

/**
 * POST /api/settings/sending-infra/providers/instantly/import
 *
 * Reads the workspace's stored (encrypted) Instantly API key, lists every
 * sending account on that Instantly workspace, and registers each as one of
 * the CALLING USER's connected mailboxes — so they appear in the unified
 * inbox rail. Idempotent.
 *
 * Admin-only. The key never leaves the server; it's decrypted in memory,
 * used, and never returned.
 */
export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    logger.error("instantly import: stored key decrypt failed", {
      err,
      tenantId: authCtx.tenantId,
    });
    return NextResponse.json(
      { error: "Stored Instantly key couldn't be read (server key mismatch)." },
      { status: 500 },
    );
  }

  const result = await importInstantlyMailboxes({
    tenantId: authCtx.tenantId,
    apiKey,
  });

  if (!result.ok) {
    logger.warn("instantly import: listing failed", {
      tenantId: authCtx.tenantId,
      error: result.errorMessage,
    });
    return NextResponse.json(
      { error: `Instantly listing failed: ${result.errorMessage}` },
      { status: 502 },
    );
  }

  logger.info("instantly import: done", {
    tenantId: authCtx.tenantId,
    total: result.total,
    imported: result.imported,
  });

  return NextResponse.json(result);
}
