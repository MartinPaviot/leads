import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import logger from "@/lib/observability/logger";

// ── GET: List existing MCP API keys (masked) ──

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const settings = await getTenantSettings(authCtx.tenantId);
    const keys = (settings.mcpApiKeys || []).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null,
    }));

    return Response.json({ keys });
  } catch (error) {
    console.error("Failed to list MCP keys:", error);
    return Response.json({ error: "Failed to list keys" }, { status: 500 });
  }
}

// ── POST: DEPRECATED — API-key MCP auth is replaced by OAuth 2.1 ──
//
// CHAT-08: /api/mcp now authenticates via OAuth (see ./authorize, ./token),
// which is per-user (not tenant-wide) and role-filtered (via
// resolveCapabilities) — a legacy API key can't express either of those, so
// generating new ones would just create credentials that don't work
// against the current /api/mcp transport. GET (list) and DELETE (revoke)
// stay functional so tenants with existing keys can see and clean them up.
export async function POST() {
  return Response.json(
    {
      error: "mcp_api_keys_deprecated",
      error_description:
        "MCP API keys are deprecated — connect via OAuth instead (Settings > MCP Integration shows the new connection URL). Existing keys can still be viewed and revoked here.",
    },
    { status: 410 },
  );
}

// ── DELETE: Revoke an MCP API key ──

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role (mcp:manage).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const keyId = String(body.id || "").trim();

    if (!keyId) {
      return Response.json({ error: "Key ID is required" }, { status: 400 });
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const existingKeys = settings.mcpApiKeys || [];
    const filtered = existingKeys.filter((k) => k.id !== keyId);

    if (filtered.length === existingKeys.length) {
      return Response.json({ error: "Key not found" }, { status: 404 });
    }

    const revokedKey = existingKeys.find((k) => k.id === keyId);

    await updateTenantSettings(authCtx.tenantId, {
      mcpApiKeys: filtered,
    });

    logger.info("mcp: api key revoked", {
      tenantId: authCtx.tenantId,
      keyId,
      keyName: revokedKey?.name,
      keyPrefix: revokedKey?.keyPrefix,
      revokedBy: authCtx.userId,
      revokedAt: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke MCP key:", error);
    return Response.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
