/**
 * RFC 7591 Dynamic Client Registration — DB-backed store. Uses the SDK's
 * own OAuthClientMetadataSchema/OAuthClientInformationFull types so the
 * wire format matches what an MCP client (Claude Desktop) actually expects,
 * without hand-rolling that validation.
 */
import { randomBytes, createHash } from "crypto";
import { db } from "@/db";
import { mcpOauthClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { OAuthClientMetadata, OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Register a new client. Public clients (token_endpoint_auth_method ===
 * "none", the default and what Claude Desktop/Cursor use) get no secret —
 * PKCE is their only proof. Confidential clients get a one-time-shown
 * secret, stored hashed.
 */
export async function registerMcpClient(
  metadata: OAuthClientMetadata,
): Promise<OAuthClientInformationFull> {
  const clientId = randomBytes(16).toString("hex");
  const isPublicClient = (metadata.token_endpoint_auth_method ?? "none") === "none";
  const rawSecret = isPublicClient ? null : randomBytes(32).toString("hex");

  await db.insert(mcpOauthClients).values({
    clientId,
    clientSecretHash: rawSecret ? hashSecret(rawSecret) : null,
    clientName: metadata.client_name || null,
    redirectUris: metadata.redirect_uris,
    tokenEndpointAuthMethod: metadata.token_endpoint_auth_method ?? "none",
    grantTypes: metadata.grant_types ?? ["authorization_code", "refresh_token"],
  });

  return {
    ...metadata,
    client_id: clientId,
    client_secret: rawSecret ?? undefined,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export interface McpClientRecord {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string | null;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
}

export async function getMcpClient(clientId: string): Promise<McpClientRecord | null> {
  const [row] = await db
    .select({
      clientId: mcpOauthClients.clientId,
      clientSecretHash: mcpOauthClients.clientSecretHash,
      clientName: mcpOauthClients.clientName,
      redirectUris: mcpOauthClients.redirectUris,
      tokenEndpointAuthMethod: mcpOauthClients.tokenEndpointAuthMethod,
    })
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  if (!row) return null;
  return { ...row, redirectUris: (row.redirectUris as string[]) || [] };
}

/** Exact-match redirect_uri validation — no partial/prefix matching, per OAuth 2.1. */
export function isRedirectUriRegistered(client: McpClientRecord, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

/** Confidential-client secret check (public clients never reach this — they have no secret to check). */
export function verifyClientSecret(client: McpClientRecord, providedSecret: string): boolean {
  if (!client.clientSecretHash) return false;
  return client.clientSecretHash === hashSecret(providedSecret);
}
