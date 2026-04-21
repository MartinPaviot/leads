/**
 * AES-256-GCM helper for encrypting small secrets (Instantly API keys,
 * future third-party sender credentials) before persisting them into
 * `tenants.settings` JSONB.
 *
 * Why GCM: authenticated encryption — a tampered ciphertext surfaces
 * as a decryption failure rather than silent-garbage plaintext.
 * Node's `crypto` module provides it natively; no new dep.
 *
 * Key sourcing:
 *   - `ELEVAY_APP_SECRET` env var (recommended, 32 bytes hex or base64).
 *   - If the env var is shorter than 32 bytes, we SHA-256 it to derive
 *     a deterministic 32-byte key. This is to make local dev trivial
 *     (any string works) without sacrificing prod (long random value).
 *
 * Ciphertext format (base64url, single string for easy JSONB storage):
 *   v1.<iv_12b>.<ciphertext_nb>.<auth_tag_16b>
 * The `v1` prefix lets us rotate algorithms in the future without a
 * backfill — readers dispatch on the prefix.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.ELEVAY_APP_SECRET;
  if (!raw) {
    throw new Error(
      "ELEVAY_APP_SECRET env var missing — required for secret encryption",
    );
  }
  // Derive a 32-byte key from whatever length the user provided.
  // SHA-256 is deterministic + fast + collision-resistant for this use.
  return createHash("sha256").update(raw, "utf8").digest();
}

function toB64Url(buf: Buffer): string {
  return buf.toString("base64url");
}
function fromB64Url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** Encrypt a UTF-8 plaintext. Returns the encoded single-string ciphertext. */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, toB64Url(iv), toB64Url(ciphertext), toB64Url(tag)].join(".");
}

/** Decrypt a previously-encoded ciphertext. Throws on any tampering. */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`decryptSecret: unsupported ciphertext format`);
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = fromB64Url(ivB64);
  const ciphertext = fromB64Url(ctB64);
  const tag = fromB64Url(tagB64);
  if (iv.length !== IV_BYTES) {
    throw new Error(`decryptSecret: unexpected IV length ${iv.length}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`decryptSecret: unexpected auth-tag length ${tag.length}`);
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/** Convenience: test-only helper that verifies a ciphertext decrypts
 *  without returning the plaintext. Useful in endpoints that want to
 *  check health without exposing the secret back to the caller. */
export function verifyCiphertextIntegrity(encoded: string): boolean {
  try {
    decryptSecret(encoded);
    return true;
  } catch {
    return false;
  }
}
