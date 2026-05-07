import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";

/** 32 bytes → 43 url-safe chars. Long enough that brute force is infeasible
 *  and short enough to survive email-client mangling. */
const TOKEN_BYTES = 32;

/** One-hour TTL is the sweet spot between "user reads the mail and resets"
 *  and "don't leave a valid credential lying around in the inbox forever". */
export const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface GeneratedToken {
  /** Raw url-safe token. Send to the user; never persist. */
  token: string;
  /** SHA-256 hex digest of the token. Store this; compare by re-hashing. */
  tokenHash: string;
}

/** Generate a fresh token and its hash. Pure function, no DB access. */
export function generateResetToken(): GeneratedToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashResetToken(token);
  return { token, tokenHash };
}

/** Hash a token the same way we do at insert time so callers can compare
 *  an incoming token against stored rows. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Invalidate any still-live reset tokens for a user, then issue a new one
 * bound to the given IP / UA. Returns the raw token so the caller can email
 * it.
 */
export async function createResetTokenForUser(
  userId: string,
  requestedIp?: string,
  requestedUserAgent?: string
): Promise<string> {
  // Mark every outstanding token as used. A previous reset request that
  // never landed in the inbox shouldn't stay valid alongside the new one
  // — a leak of either would open both windows.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt)
      )
    );

  const { token, tokenHash } = generateResetToken();
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    requestedIp: requestedIp ?? null,
    requestedUserAgent: requestedUserAgent ?? null,
  });
  return token;
}

export interface ValidResetToken {
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
 * Look up a token by hash, returning the row only if it's un-used and not
 * expired. Returns null in every other case (missing, used, expired) — we
 * never distinguish between these to the caller so an attacker can't
 * enumerate state.
 */
export async function validateResetToken(
  token: string
): Promise<ValidResetToken | null> {
  if (!token || token.length < 10) return null;
  const tokenHash = hashResetToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

/** Mark a token consumed. Idempotent — safe to call on an already-used row. */
export async function consumeResetToken(tokenId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

/** Minimum password length — NIST SP 800-63B §5.1.1.2 recommends 12+
 *  for user-chosen secrets. Raised from the v1 floor of 10 (M11). */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * v2 password policy (M11): ≥12 chars, at least one digit, one lower,
 * one upper. Composition rules stay minimal — NIST explicitly
 * recommends *against* complex composition. The real defense against
 * weak secrets is the `isPasswordPwned` HIBP check performed in
 * parallel by every call site (sign-up, reset, change), which rejects
 * known-breached passwords regardless of whether they satisfy the
 * composition heuristics.
 */
export function isPasswordAcceptable(password: string): boolean {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= 256 &&
    /[0-9]/.test(password) &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password)
  );
}
