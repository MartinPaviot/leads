import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tracking tokens for outbound-email open / click instrumentation.
 *
 * Goal: stop an unauthenticated caller from mass-hitting `/api/track/open`
 * or `/api/track/click` with guessed or scraped `emailId` values to
 * inflate metrics, poison deal-health signals, or misattribute intent.
 *
 * Shape: `v1.<base64url(emailId)>.<base64url(hmac)>` — short, URL-safe,
 * survives pasting into plain-text email bodies without transformation.
 *
 * Signing key: `AUTH_SECRET` (we already require it at runtime for
 * NextAuth and unsubscribe tokens; no new env var needed). Rotating
 * `AUTH_SECRET` invalidates outstanding tracking tokens — acceptable
 * because trackers are short-lived (email deliverability decays after
 * a few days anyway).
 *
 * NOTE: we don't embed a timestamp. Opens/clicks of older emails remain
 * meaningful signal (e.g. an email a user rereads three weeks later),
 * so forcing expiry would drop legitimate data. If we ever want a
 * sliding window we can extend the shape to `v2.<ts>.<id>.<sig>`.
 */

function getSigningKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not configured — required for tracking tokens");
  }
  // Namespace the key so the same AUTH_SECRET used elsewhere can't be
  // replayed here (and vice-versa).
  return createHmac("sha256", secret).update("tracking-token/v1").digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64url(s: string): Buffer | null {
  try {
    return Buffer.from(s, "base64url");
  } catch {
    return null;
  }
}

export function signTrackingId(emailId: string): string {
  const key = getSigningKey();
  const idBuf = Buffer.from(emailId, "utf8");
  const sig = createHmac("sha256", key).update(idBuf).digest();
  return `v1.${b64url(idBuf)}.${b64url(sig)}`;
}

/**
 * Verify a signed tracking token and return the original emailId, or
 * `null` on any failure (bad shape, wrong version, invalid sig).
 * Uses `timingSafeEqual` so an attacker can't distinguish near-miss
 * signatures by response time.
 */
export function verifyTrackingId(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, encId, encSig] = parts;
  if (version !== "v1") return null;
  const idBuf = fromB64url(encId);
  const sigBuf = fromB64url(encSig);
  if (!idBuf || !sigBuf) return null;

  const key = getSigningKey();
  const expected = createHmac("sha256", key).update(idBuf).digest();
  if (sigBuf.length !== expected.length) return null;
  if (!timingSafeEqual(sigBuf, expected)) return null;

  return idBuf.toString("utf8");
}
