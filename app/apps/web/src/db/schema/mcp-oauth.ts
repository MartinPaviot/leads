/**
 * CHAT-08 Part B — MCP OAuth 2.1 authorization server tables.
 *
 * LeadSens is NOT an OAuth client here (that's NextAuth's job, consuming
 * Google/Microsoft) — this is LeadSens acting as the OAuth **provider**,
 * issuing tokens to external MCP clients (Claude Desktop, Cursor). See
 * _specs/CHAT-08-external-reach/design.md for why this is separate,
 * genuinely new infrastructure, not a NextAuth reuse.
 *
 * Access/refresh tokens are stored as SHA-256 hashes, never the raw value
 * (lib/mcp/oauth/tokens.ts) — mirrors how a DB leak shouldn't hand out
 * usable bearer credentials, same defense-in-depth reasoning as password
 * hashing (distinct from lib/crypto/oauth-token-crypto.ts's encrypt/decrypt
 * pattern for Google/MS tokens, which we DO need to reveal again to call
 * their APIs — an MCP bearer token never needs to be shown to us again
 * after issuance, so hash-and-compare is the right primitive here, not
 * reversible encryption).
 */
import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, users } from "./core";

export const mcpOauthClients = pgTable(
  "mcp_oauth_clients",
  {
    clientId: text("client_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // Only set for confidential clients (token_endpoint_auth_method !==
    // "none"). Native apps like Claude Desktop register as public clients
    // and rely on PKCE instead of a secret.
    clientSecretHash: text("client_secret_hash"),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").notNull().default([]),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
    grantTypes: jsonb("grant_types").notNull().default(["authorization_code", "refresh_token"]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * A short-lived, single-use authorization code (RFC 6749 §4.1). Persists
 * the FULL resolved AuthContext at consent time (tenantId/authUserId/
 * appUserId/role) — there is no NextAuth session to re-derive from later
 * when the client exchanges the code (or later still, uses the access
 * token), so this is the one point where we snapshot who approved. Role
 * changes after issuance don't retroactively apply — same semantic as any
 * session/JWT; re-authorizing is how a role change takes effect for MCP.
 */
export const mcpOauthAuthorizationCodes = pgTable(
  "mcp_oauth_authorization_codes",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id").notNull().references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").notNull(),
    appUserId: text("app_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
    scope: text("scope").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("mcp_oauth_codes_client_idx").on(table.clientId)],
);

export const mcpOauthTokens = pgTable(
  "mcp_oauth_tokens",
  {
    accessTokenHash: text("access_token_hash").primaryKey(),
    refreshTokenHash: text("refresh_token_hash"),
    clientId: text("client_id").notNull().references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").notNull(),
    appUserId: text("app_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    scope: text("scope").notNull().default(""),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mcp_oauth_tokens_refresh_idx").on(table.refreshTokenHash),
    index("mcp_oauth_tokens_client_idx").on(table.clientId),
    index("mcp_oauth_tokens_tenant_idx").on(table.tenantId),
  ],
);
