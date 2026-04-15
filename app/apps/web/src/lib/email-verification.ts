// Bare `crypto` specifier — see auth-lockout.ts for why `node:crypto`
// trips webpack's edge-runtime pass even on server-only modules.
import { randomBytes, createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authUsers, emailVerificationTokens } from "@/db/schema";

/**
 * S2 — email verification.
 *
 * Mirrors `lib/password-reset.ts` because the threat model is identical:
 *  - The raw token is emailed; only its SHA-256 digest is stored, so a
 *    DB leak can't be replayed.
 *  - There's exactly one outstanding token per user — issuing a new one
 *    invalidates older ones, so a leaked-then-discarded inbox doesn't
 *    leave a parallel valid window.
 *  - Validation always returns null on missing / used / expired so the
 *    caller can't differentiate failure modes (no enumeration).
 */
const TOKEN_BYTES = 32;

/**
 * 24h is longer than password-reset on purpose: a sign-up confirmation
 * email is the kind of thing people read on Monday morning. 1h would
 * burn legitimate users.
 */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface GeneratedVerifyToken {
  /** Raw url-safe token. Send to the user; never persist. */
  token: string;
  /** SHA-256 hex digest of the token. Store this; compare by re-hashing. */
  tokenHash: string;
}

export function generateVerifyToken(): GeneratedVerifyToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashVerifyToken(token);
  return { token, tokenHash };
}

export function hashVerifyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Invalidate any still-live verify tokens for a user, then issue a new
 * one. Returns the raw token so the caller can email it.
 */
export async function createVerifyTokenForUser(
  userId: string,
  requestedIp?: string,
  requestedUserAgent?: string
): Promise<string> {
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt)
      )
    );

  const { token, tokenHash } = generateVerifyToken();
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    requestedIp: requestedIp ?? null,
    requestedUserAgent: requestedUserAgent ?? null,
  });
  return token;
}

export interface ValidVerifyToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  requestedIp: string | null;
  requestedUserAgent: string | null;
}

/**
 * Look up a token by hash, returning the row only if it's un-used and
 * not expired. Returns null in every other case (missing, used, expired).
 */
export async function validateVerifyToken(
  token: string
): Promise<ValidVerifyToken | null> {
  if (!token || token.length < 10) return null;
  const tokenHash = hashVerifyToken(token);
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

export async function consumeVerifyToken(tokenId: string): Promise<void> {
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, tokenId));
}

/**
 * Stamp `auth_user.emailVerified` so downstream gates can read a single
 * source of truth (the column is the NextAuth standard, already used by
 * the OAuth flow). Idempotent — safe to call on an already-verified row.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await db
    .update(authUsers)
    .set({ emailVerified: new Date() })
    .where(eq(authUsers.id, userId));
}

/**
 * Read the verified-at timestamp for a user. Returns `null` when the
 * user is missing or hasn't verified yet.
 */
export async function getEmailVerifiedAt(
  userId: string
): Promise<Date | null> {
  const [row] = await db
    .select({ emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return row?.emailVerified ?? null;
}
