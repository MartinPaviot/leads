import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import type { McpApiKeyEntry } from "@/lib/config/tenant-settings";
import { hash } from "bcryptjs";
import logger from "@/lib/observability/logger";

/**
 * Generate a cryptographically random MCP API key.
 * Format: mcp_<32 hex chars> = 36 chars total
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mcp_${hex}`;
}

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

// ── POST: Generate a new MCP API key ──

export async function POST(req: Request) {
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
    const name = String(body.name || "Default key").trim().slice(0, 100);

    const settings = await getTenantSettings(authCtx.tenantId);
    const existingKeys = settings.mcpApiKeys || [];

    // Limit to 5 active keys per tenant
    if (existingKeys.length >= 5) {
      return Response.json(
        { error: "Maximum 5 MCP API keys allowed. Revoke an existing key first." },
        { status: 400 }
      );
    }

    // Generate key
    const rawKey = generateApiKey();
    const keyHash = await hash(rawKey, 10);
    const keyPrefix = rawKey.slice(0, 8) + "...";

    const now = new Date().toISOString();
    const entry: McpApiKeyEntry = {
      id: crypto.randomUUID(),
      name,
      keyHash,
      keyPrefix,
      createdAt: now,
      keyCreatedAt: now,
      keyOwnerId: authCtx.userId,
    };

    await updateTenantSettings(authCtx.tenantId, {
      mcpApiKeys: [...existingKeys, entry],
    });

    logger.info("mcp: api key created", {
      tenantId: authCtx.tenantId,
      keyId: entry.id,
      keyName: entry.name,
      keyPrefix: entry.keyPrefix,
      keyOwnerId: authCtx.userId,
      createdAt: now,
    });

    // Return the raw key ONCE — it cannot be retrieved again
    return Response.json(
      {
        key: {
          id: entry.id,
          name: entry.name,
          keyPrefix: entry.keyPrefix,
          createdAt: entry.createdAt,
          // This is the only time the full key is returned
          rawKey,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create MCP key:", error);
    return Response.json({ error: "Failed to create key" }, { status: 500 });
  }
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
