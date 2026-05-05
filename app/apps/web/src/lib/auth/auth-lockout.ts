import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { failedSignInAttempts } from "@/db/schema";

/**
 * I6 — sign-in brute-force protection.
 *
 * Per-account lockout (5 failed attempts inside a 15-minute rolling
 * window → locked for the remainder of that window). Per-IP could be
 * added later, but per-account is what blocks the actual attack
 * (credential stuffing against a single victim) without locking out
 * everyone behind a corporate NAT egress.
 *
 * **No email leakage.** We hash the normalised email before writing,
 * so reading the table never reveals registered accounts. We also lock
 * out for unknown emails — same code path, same response timing — so
 * an attacker probing for valid accounts can't tell them apart from
 * locked ones.
 *
 * The store lives in Postgres because in-memory state would forget the
 * lockout on every Next.js cold start (single-machine attacker walks
 * around it trivially).
 */

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// L4 — per-IP lockout: a separate, looser ceiling. Per-account
// protects a known victim from being brute-forced, but an attacker
// can still hammer an IP with 5 probes per account across many
// accounts. Per-IP caps total failed attempts from one source over
// 1h — generous enough not to trip a corp NAT with a few mistyped
// passwords, tight enough to make credential-stuffing expensive.
export const IP_LOCKOUT_THRESHOLD = 30;
export const IP_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;

/**
 * SHA-256 the normalised email so the failure log is enumeration-proof.
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle.digest`) rather
 * than Node's `node:crypto` so the same module can be evaluated in
 * both the Node runtime (API routes, server actions, credentials
 * `authorize()`) and the Edge runtime (NextAuth middleware pulls this
 * transitively via `auth.ts` for session handling). Web Crypto is
 * async, so callers await — the other three functions in this file
 * are already async, so the change only adds an await at the hash
 * call site.
 */
export async function hashIdentifier(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.toLowerCase().trim());
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const bytesOut = new Uint8Array(hashBuf);
  let hex = "";
  for (let i = 0; i < bytesOut.length; i++) {
    hex += bytesOut[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export interface LockoutStatus {
  locked: boolean;
  /** When the user can try again. `null` while not locked. */
  retryAt: Date | null;
  /** Number of failed attempts inside the current rolling window. */
  attemptsInWindow: number;
}

/**
 * Read the lockout status for an identifier without recording a new
 * failure. Used at the start of `authorize()` to short-circuit before
 * the bcrypt comparison even runs.
 */
export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  const identifierHash = await hashIdentifier(email);
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);

  const rows = await db
    .select({ attemptedAt: failedSignInAttempts.attemptedAt })
    .from(failedSignInAttempts)
    .where(
      and(
        eq(failedSignInAttempts.identifierHash, identifierHash),
        gt(failedSignInAttempts.attemptedAt, windowStart)
      )
    );

  const attemptsInWindow = rows.length;
  if (attemptsInWindow < LOCKOUT_THRESHOLD) {
    return { locked: false, retryAt: null, attemptsInWindow };
  }

  // The lockout window ends at the timestamp of the oldest still-counting
  // failure plus the window length — that's when it falls out of the
  // 15-min rolling cutoff and the count drops back below the threshold.
  const oldest = rows
    .map((r) => r.attemptedAt.getTime())
    .reduce((a, b) => Math.min(a, b), Infinity);
  const retryAt = new Date(oldest + LOCKOUT_WINDOW_MS);
  return { locked: true, retryAt, attemptsInWindow };
}

/**
 * L4 — per-IP status. Returns `locked: true` when this IP has
 * accumulated `IP_LOCKOUT_THRESHOLD` failures across any account in
 * the last `IP_LOCKOUT_WINDOW_MS`. The per-email check in
 * `getLockoutStatus` remains the primary defense; this layer catches
 * credential-stuffing runs that spread thin across many accounts to
 * stay under the per-email cap.
 */
export async function getIpLockoutStatus(
  ip: string | null
): Promise<LockoutStatus> {
  if (!ip) return { locked: false, retryAt: null, attemptsInWindow: 0 };
  const windowStart = new Date(Date.now() - IP_LOCKOUT_WINDOW_MS);
  const rows = await db
    .select({ attemptedAt: failedSignInAttempts.attemptedAt })
    .from(failedSignInAttempts)
    .where(
      and(
        eq(failedSignInAttempts.ip, ip),
        gt(failedSignInAttempts.attemptedAt, windowStart)
      )
    );

  const attemptsInWindow = rows.length;
  if (attemptsInWindow < IP_LOCKOUT_THRESHOLD) {
    return { locked: false, retryAt: null, attemptsInWindow };
  }
  const oldest = rows
    .map((r) => r.attemptedAt.getTime())
    .reduce((a, b) => Math.min(a, b), Infinity);
  return {
    locked: true,
    retryAt: new Date(oldest + IP_LOCKOUT_WINDOW_MS),
    attemptsInWindow,
  };
}

/**
 * Record a failed sign-in. Always succeeds — failures here must NEVER
 * propagate up and turn into a 500 (we'd be giving the attacker a
 * trivial DoS against the DB by triggering enough failures to break
 * write throughput). We swallow + log instead.
 *
 * Opportunistically prunes rows older than the window so the table
 * stays small without needing a cron job.
 */
export async function recordFailedSignIn(
  email: string,
  ip?: string | null
): Promise<void> {
  const identifierHash = await hashIdentifier(email);
  try {
    await db.insert(failedSignInAttempts).values({
      identifierHash,
      ip: ip ?? null,
    });
    // Best-effort cleanup — older than the window can never affect
    // any future lockout decision.
    await db
      .delete(failedSignInAttempts)
      .where(
        lt(
          failedSignInAttempts.attemptedAt,
          new Date(Date.now() - LOCKOUT_WINDOW_MS)
        )
      );
  } catch (err) {
    // Don't propagate — see header comment.
    console.warn("auth-lockout: recordFailedSignIn failed", err);
  }
}

/**
 * Wipe the failure log for an identifier on a successful sign-in so the
 * counter can't drift past 5 across legitimate sessions.
 */
export async function clearFailedSignIns(email: string): Promise<void> {
  const identifierHash = await hashIdentifier(email);
  try {
    await db
      .delete(failedSignInAttempts)
      .where(eq(failedSignInAttempts.identifierHash, identifierHash));
  } catch (err) {
    console.warn("auth-lockout: clearFailedSignIns failed", err);
  }
}

/**
 * Format the retry time into a human "in N minutes" string for the
 * sign-in error banner. Always rounds up to the nearest minute so we
 * never undershoot and tell the user "1 minute" when it's really 80s.
 */
export function formatRetryIn(retryAt: Date): string {
  const ms = retryAt.getTime() - Date.now();
  if (ms <= 0) return "in a moment";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return "in 1 minute";
  return `in ${minutes} minutes`;
}
