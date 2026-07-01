/**
 * Access + refresh token issuance, verification, and rotation. Tokens are
 * stored as SHA-256 hashes (tokens.ts) — the raw value is returned to the
 * client exactly once, at issuance/refresh, never persisted or re-shown.
 */
import { db } from "@/db";
import { mcpOauthTokens } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateOpaqueToken, hashToken } from "./tokens";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface TokenPrincipal {
  clientId: string;
  tenantId: string;
  authUserId: string;
  appUserId: string;
  role: string;
  scope: string;
}

/** Issue a fresh access+refresh token pair for a principal (new grant or a rotation). */
export async function issueTokens(principal: TokenPrincipal): Promise<IssuedTokens> {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const now = Date.now();

  await db.insert(mcpOauthTokens).values({
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: principal.clientId,
    tenantId: principal.tenantId,
    authUserId: principal.authUserId,
    appUserId: principal.appUserId,
    role: principal.role,
    scope: principal.scope,
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return { accessToken, refreshToken, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

export type VerifyAccessTokenResult =
  | { ok: true; clientId: string; tenantId: string; authUserId: string; appUserId: string; role: string; scope: string; expiresAtEpochSeconds: number }
  | { ok: false };

/** Look up + validate a bearer access token. Fail-closed on any ambiguity. */
export async function verifyAccessToken(rawToken: string): Promise<VerifyAccessTokenResult> {
  if (!rawToken) return { ok: false };
  const [row] = await db
    .select()
    .from(mcpOauthTokens)
    .where(and(eq(mcpOauthTokens.accessTokenHash, hashToken(rawToken)), isNull(mcpOauthTokens.revokedAt)))
    .limit(1);
  if (!row) return { ok: false };
  if (row.accessTokenExpiresAt.getTime() < Date.now()) return { ok: false };
  return {
    ok: true,
    clientId: row.clientId,
    tenantId: row.tenantId,
    authUserId: row.authUserId,
    appUserId: row.appUserId,
    role: row.role,
    scope: row.scope,
    expiresAtEpochSeconds: Math.floor(row.accessTokenExpiresAt.getTime() / 1000),
  };
}

export type RefreshResult =
  | { ok: true; tokens: IssuedTokens; scope: string }
  | { ok: false; error: "invalid_grant"; reason: string };

/**
 * Rotate a refresh token: the OLD refresh+access token pair is revoked and
 * a brand new pair issued. Rotation (not reuse) means a stolen refresh
 * token that gets used by an attacker AND the legitimate client both submit
 * the same old token — whichever loses the race gets `invalid_grant`, and
 * because the row is revoked (not deleted), a later reuse attempt of the
 * same old token is unambiguously rejected rather than silently no-op'd.
 */
export async function refreshTokens(rawRefreshToken: string, clientId: string): Promise<RefreshResult> {
  const [row] = await db
    .select()
    .from(mcpOauthTokens)
    .where(and(eq(mcpOauthTokens.refreshTokenHash, hashToken(rawRefreshToken)), isNull(mcpOauthTokens.revokedAt)))
    .limit(1);
  if (!row) return { ok: false, error: "invalid_grant", reason: "unknown or revoked refresh token" };
  if (row.clientId !== clientId) return { ok: false, error: "invalid_grant", reason: "client mismatch" };
  if (!row.refreshTokenExpiresAt || row.refreshTokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: "invalid_grant", reason: "refresh token expired" };
  }

  // Atomic revoke — the WHERE re-asserts revokedAt IS NULL so a racing
  // second refresh attempt with the same token updates 0 rows.
  const revoked = await db
    .update(mcpOauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpOauthTokens.accessTokenHash, row.accessTokenHash), isNull(mcpOauthTokens.revokedAt)))
    .returning({ accessTokenHash: mcpOauthTokens.accessTokenHash });
  if (revoked.length === 0) {
    return { ok: false, error: "invalid_grant", reason: "refresh token already rotated (race)" };
  }

  const tokens = await issueTokens({
    clientId: row.clientId,
    tenantId: row.tenantId,
    authUserId: row.authUserId,
    appUserId: row.appUserId,
    role: row.role,
    scope: row.scope,
  });
  return { ok: true, tokens, scope: row.scope };
}
