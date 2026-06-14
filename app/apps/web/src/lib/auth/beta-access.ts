import { createHmac, timingSafeEqual } from "crypto";

/**
 * Shared beta-access link.
 *
 * Elevay is invitation-only in production (see self-serve-signup.ts). The beta
 * link is the founder's controlled exception: a single secret code, shared by
 * the founder, that re-opens self-serve sign-up for whoever holds the link —
 * each new tester self-provisions their OWN workspace (they never join the
 * founder's tenant).
 *
 * Flow: the tester opens `/join?code=<CODE>`. If the code matches
 * BETA_SIGNUP_CODE we drop a short-lived, HMAC-signed cookie and forward them
 * to /sign-up, which renders a normal self-serve form (email editable, no
 * invite required). The cookie is what authorizes the three downstream gates —
 * the OAuth `signIn` callback, the credentials sign-up action, and
 * `resolveUserTenant`'s tenant-creation branch — across the OAuth round-trip
 * and into the NextAuth callbacks.
 *
 * To rotate / end the beta: change BETA_SIGNUP_CODE (old links stop working on
 * the next deploy). The code is never stored; only its env value is compared,
 * constant-time.
 */

export const BETA_ACCESS_COOKIE = "elevay_beta_access";

/** Window a tester has to finish sign-up after clicking the link. */
const BETA_ACCESS_TTL_MS = 30 * 60 * 1000;

function configuredCode(): string | null {
  const code = (process.env.BETA_SIGNUP_CODE ?? "").trim();
  return code.length > 0 ? code : null;
}

/** Whether a beta code is configured at all (feature on/off). */
export function isBetaSignupConfigured(): boolean {
  return configuredCode() !== null;
}

function signingSecret(): string {
  // Reuse the NextAuth secret so we don't introduce a second key to manage.
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    // Last-resort: an unsigned cookie is worthless, so refuse to mint one.
    ""
  );
}

/**
 * Constant-time check that a presented code matches the configured one.
 * Returns false when no code is configured (feature off) or on any length
 * mismatch — never throws, never leaks length via early return timing beyond
 * the unavoidable length guard.
 */
export function verifyBetaCode(raw: string | null | undefined): boolean {
  const expected = configuredCode();
  if (!expected) return false;
  const got = (raw ?? "").trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmac(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

/**
 * Mint the signed cookie value: `<expiry-ms>.<hmac>`. Returns null when no
 * signing secret is available (we never issue an unsigned grant).
 */
export function mintBetaAccessCookie(now = Date.now()): string | null {
  if (!signingSecret()) return null;
  const exp = now + BETA_ACCESS_TTL_MS;
  return `${exp}.${hmac(`beta:${exp}`)}`;
}

/**
 * Verify a cookie value: correct HMAC (forgery-proof without the secret) AND
 * not expired. Fail-closed on any malformed input.
 */
export function isBetaAccessCookieValid(
  value: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!value || !signingSecret()) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = hmac(`beta:${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Read the request's beta-access cookie and return whether it's a valid,
 * unexpired grant. Server-only (uses next/headers). Fail-closed: any error
 * reading cookies denies — a non-beta user simply isn't granted self-serve.
 */
export async function hasBetaAccess(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return isBetaAccessCookieValid(store.get(BETA_ACCESS_COOKIE)?.value);
  } catch {
    return false;
  }
}
