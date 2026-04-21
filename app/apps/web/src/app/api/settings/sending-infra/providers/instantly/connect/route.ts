import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { updateTenantSettings } from "@/lib/tenant-settings";
import { testInstantlyConnection } from "@/lib/providers/instantly-client";
import { encryptSecret } from "@/lib/crypto/settings-encryption";
import logger from "@/lib/logger";

/**
 * POST /api/settings/sending-infra/providers/instantly/connect
 *
 * Validates the provided Instantly API key by probing the accounts
 * endpoint, encrypts it with ELEVAY_APP_SECRET, stores the ciphertext
 * in `settings.instantlyCredentialsEncrypted`, and flips the tenant's
 * sending mode to `external-connected`.
 *
 * Admin-only. The plaintext key never leaves memory — it's not
 * logged, never returned, and never persisted in plaintext.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as {
    apiKey?: unknown;
  };

  if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 20) {
    return NextResponse.json(
      { error: "apiKey must be a string of at least 20 characters" },
      { status: 400 },
    );
  }

  const apiKey = body.apiKey.trim();

  // Probe Instantly — reject bad keys BEFORE we touch settings so the
  // user gets a clean "credentials rejected" error instead of a happy
  // "connected" followed by silent send failures.
  const health = await testInstantlyConnection({ apiKey });
  if (!health.ok) {
    logger.warn("instantly: connection test failed", {
      tenantId: authCtx.tenantId,
      status: health.status,
    });
    return NextResponse.json(
      {
        error: `Instantly rejected the API key (HTTP ${health.status})`,
        detail: health.errorMessage,
      },
      { status: 400 },
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(apiKey);
  } catch (err) {
    logger.error("instantly: encrypt failed", { err });
    return NextResponse.json(
      {
        error:
          "Encryption failed — ensure ELEVAY_APP_SECRET is set on the server.",
      },
      { status: 500 },
    );
  }

  await updateTenantSettings(authCtx.tenantId, {
    instantlyCredentialsEncrypted: encrypted,
    sendingMailboxMode: "external-connected",
  });

  return NextResponse.json({
    ok: true,
    mode: "external-connected",
    accountCount: health.accountCount ?? null,
  });
}
