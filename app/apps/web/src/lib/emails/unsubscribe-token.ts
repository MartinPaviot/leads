import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generate a deterministic HMAC token for an unsubscribe URL.
 *
 * Deterministic so the same `(tenantId, email)` pair always yields the same
 * token — the token only encodes consent intent, not nonce-style replay
 * protection. Replay isn't a threat: re-using an unsubscribe link just
 * (idempotently) re-confirms the opt-out.
 */
export function generateUnsubscribeToken(tenantId: string, email: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret)
    .update(`${tenantId}:${email.toLowerCase()}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(
  tenantId: string,
  email: string,
  token: string,
): boolean {
  try {
    const expected = generateUnsubscribeToken(tenantId, email);
    const expectedBuf = Buffer.from(expected, "hex");
    const tokenBuf = Buffer.from(token, "hex");
    if (expectedBuf.length !== tokenBuf.length) return false;
    return timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
}

/** Build the full unsubscribe URL with HMAC token. */
export function buildUnsubscribeUrl(
  appUrl: string,
  tenantId: string,
  email: string,
): string {
  const cleanEmail = email.toLowerCase();
  const token = generateUnsubscribeToken(tenantId, cleanEmail);
  return `${appUrl}/api/unsubscribe?email=${encodeURIComponent(cleanEmail)}&tenant=${encodeURIComponent(tenantId)}&token=${token}`;
}
