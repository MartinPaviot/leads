// Use the bare `crypto` specifier (not `node:crypto`): this file is
// reachable from `src/auth.ts`, which Next.js walks for its edge-runtime
// bundle pass. Webpack's handler for `node:*` schemes trips even when
// the module actually stays server-side at runtime ("UnhandledSchemeError:
// node:crypto"). The plain `"crypto"` specifier resolves to the same
// Node built-in and bypasses the handler.
import { createHash } from "crypto";
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

/** SHA-256 the normalised email so the failure log is enumeration-proof. */
export function hashIdentifier(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
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
  const identifierHash = hashIdentifier(email);
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
  const identifierHash = hashIdentifier(email);
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
  const identifierHash = hashIdentifier(email);
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
