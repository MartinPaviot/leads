/**
 * Authorization code issuance + single-use consumption (RFC 6749 §4.1,
 * PKCE per RFC 7636). A code is a snapshot of "this LeadSens user, at this
 * moment, approved this client for this scope" — see db/schema/mcp-oauth.ts
 * for why the full AuthContext is persisted here rather than re-derived.
 */
import { db } from "@/db";
import { mcpOauthAuthorizationCodes } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateAuthorizationCode } from "./tokens";
import { verifyPkce } from "./pkce";

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes — short-lived per RFC 6749 recommendation

export interface IssueAuthorizationCodeInput {
  clientId: string;
  tenantId: string;
  authUserId: string;
  appUserId: string;
  role: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export async function issueAuthorizationCode(input: IssueAuthorizationCodeInput): Promise<string> {
  const code = generateAuthorizationCode();
  await db.insert(mcpOauthAuthorizationCodes).values({
    code,
    clientId: input.clientId,
    tenantId: input.tenantId,
    authUserId: input.authUserId,
    appUserId: input.appUserId,
    role: input.role,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export type ConsumeCodeResult =
  | {
      ok: true;
      tenantId: string;
      authUserId: string;
      appUserId: string;
      role: string;
      scope: string;
    }
  | { ok: false; error: "invalid_grant"; reason: string };

/**
 * Consume a code exactly once: validates it exists, isn't expired/already
 * used, matches the client + redirect_uri that requested it, and that the
 * supplied code_verifier hashes to the stored code_challenge. Marks it
 * consumed in the SAME check (not a separate step) so a racing double-
 * exchange can't both succeed — the second caller's UPDATE affects 0 rows.
 */
export async function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<ConsumeCodeResult> {
  const [row] = await db
    .select()
    .from(mcpOauthAuthorizationCodes)
    .where(and(eq(mcpOauthAuthorizationCodes.code, params.code), isNull(mcpOauthAuthorizationCodes.consumedAt)))
    .limit(1);

  if (!row) return { ok: false, error: "invalid_grant", reason: "unknown or already-used code" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "invalid_grant", reason: "code expired" };
  if (row.clientId !== params.clientId) return { ok: false, error: "invalid_grant", reason: "client mismatch" };
  if (row.redirectUri !== params.redirectUri) return { ok: false, error: "invalid_grant", reason: "redirect_uri mismatch" };
  if (!verifyPkce(params.codeVerifier, row.codeChallenge, row.codeChallengeMethod)) {
    return { ok: false, error: "invalid_grant", reason: "PKCE verification failed" };
  }

  // Atomic single-use: the WHERE re-asserts consumedAt IS NULL so a racing
  // second exchange attempt (same code, e.g. a retried request) updates 0
  // rows and is rejected below rather than silently succeeding twice.
  const updated = await db
    .update(mcpOauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(mcpOauthAuthorizationCodes.code, params.code), isNull(mcpOauthAuthorizationCodes.consumedAt)))
    .returning({ code: mcpOauthAuthorizationCodes.code });

  if (updated.length === 0) {
    return { ok: false, error: "invalid_grant", reason: "code already consumed (race)" };
  }

  return {
    ok: true,
    tenantId: row.tenantId,
    authUserId: row.authUserId,
    appUserId: row.appUserId,
    role: row.role,
    scope: row.scope,
  };
}
