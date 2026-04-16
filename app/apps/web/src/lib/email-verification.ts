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

/**
 * Web Crypto replaces node:crypto so this module stays edge-safe.
 * NextAuth middleware transitively imports this file (via `auth.ts`),
 * and the middleware runs on the Edge runtime where `node:*` modules
 * aren't available.
 */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // `btoa` is available on both Node 16+ and Edge.
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export async function generateVerifyToken(): Promise<GeneratedVerifyToken> {
  const raw = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(raw);
  const token = toBase64Url(raw);
  const tokenHash = await hashVerifyToken(token);
  return { token, tokenHash };
}

export async function hashVerifyToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(hashBuf));
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

  const { token, tokenHash } = await generateVerifyToken();
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
  const tokenHash = await hashVerifyToken(token);
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
