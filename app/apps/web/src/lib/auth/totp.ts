/**
 * SOC2 T4 — TOTP (RFC 6238, HMAC-SHA1, 30s step, 6 digits) on node:crypto.
 *
 * Deliberately dependency-free: the worktree/node_modules is shared with
 * parallel sessions, so adding otplib would force a pnpm install mid-flight.
 * The algorithm is ~40 lines and locked down by the RFC 6238 Appendix B
 * test vectors in __tests__/totp.test.ts — safer than it sounds, and the
 * vectors make any regression loud.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("base32Decode: invalid character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) — HMAC-SHA1 + dynamic truncation. */
function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  // Counter fits in 53 bits for any realistic timestamp; write hi/lo 32.
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** 160-bit random secret, base32 (the format authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secretB32: string, timeMs: number): string {
  const step = Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretB32), step);
}

export interface TotpVerification {
  valid: boolean;
  /** The matched counter step — persist it to refuse replay of the same code. */
  matchedStep: number | null;
}

/**
 * Verify with a ±`window` step tolerance (default 1 = ±30s clock skew).
 * Constant-time comparison per candidate.
 */
export function verifyTotp(
  code: string,
  secretB32: string,
  opts: { window?: number; timeMs?: number } = {},
): TotpVerification {
  const window = opts.window ?? 1;
  const timeMs = opts.timeMs ?? Date.now();
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return { valid: false, matchedStep: null };
  const key = base32Decode(secretB32);
  const currentStep = Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
  const given = Buffer.from(normalized);
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(hotp(key, currentStep + i));
    if (candidate.length === given.length && timingSafeEqual(candidate, given)) {
      return { valid: true, matchedStep: currentStep + i };
    }
  }
  return { valid: false, matchedStep: null };
}

/** otpauth:// URI for authenticator apps (manual-entry key is the secret itself). */
export function buildOtpauthUrl(secretB32: string, accountEmail: string): string {
  const issuer = "Elevay";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
