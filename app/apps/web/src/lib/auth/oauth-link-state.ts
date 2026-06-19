/**
 * OAuth-LINK state (A1 R1.2 / R7.5) — a CSRF-resistant, single-use, short-TTL
 * token that binds an "add another mailbox" OAuth round-trip to the initiating
 * user + tenant, WITHOUT going through next-auth signIn.
 *
 * The token is HMAC-SHA256 signed over the NextAuth secret (same key custody as
 * beta-access.ts / settings-encryption — no new secret to manage). It carries a
 * random nonce so each link attempt is unique; single-use is enforced by the
 * route comparing the callback's nonce to the one it stored in a signed cookie
 * at init time. Pure + unit-testable (no DB, no network); the clock is injectable.
 */

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export type LinkProvider = "gmail" | "outlook";

export interface LinkStatePayload {
  /** auth-user id (== connected_mailboxes.user_id space). */
  authUserId: string;
  tenantId: string;
  provider: LinkProvider;
  /** Random single-use nonce; the route binds it to a signed cookie. */
  nonce: string;
  /** Expiry, epoch ms. */
  exp: number;
}

/** 10 minutes is plenty for a consent round-trip and short enough to limit replay. */
export const LINK_STATE_TTL_MS = 10 * 60 * 1000;

function signingSecret(): string {
  // Reuse the NextAuth secret (mirrors beta-access.ts:43) — one key to manage.
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

function hmac(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

function sigEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Mint a signed link-state token `<payloadB64url>.<hmacHex>`. Generates the
 * nonce + exp. Throws when no signing secret is configured — we never issue an
 * unsigned (forgeable) state.
 */
export function signLinkState(
  input: { authUserId: string; tenantId: string; provider: LinkProvider; nonce?: string },
  opts: { ttlMs?: number; now?: number } = {},
): { token: string; nonce: string; exp: number } {
  const secret = signingSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured; cannot sign OAuth-link state.");
  const now = opts.now ?? Date.now();
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const exp = now + (opts.ttlMs ?? LINK_STATE_TTL_MS);
  const payload: LinkStatePayload = {
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    provider: input.provider,
    nonce,
    exp,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${b64}.${hmac(b64, secret)}`, nonce, exp };
}

/**
 * Verify + decode a link-state token. Returns the payload only when the HMAC
 * matches (forgery-proof without the secret) AND it is not expired. Fail-closed:
 * any malformed input, wrong secret, or expiry returns null.
 */
export function verifyLinkState(token: string | null | undefined, now: number = Date.now()): LinkStatePayload | null {
  const secret = signingSecret();
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sigEqual(sig, hmac(b64, secret))) return null;
  let payload: LinkStatePayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as LinkStatePayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.authUserId !== "string" ||
    typeof payload.tenantId !== "string" ||
    (payload.provider !== "gmail" && payload.provider !== "outlook") ||
    typeof payload.nonce !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp <= now) return null;
  return payload;
}
