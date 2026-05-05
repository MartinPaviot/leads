import { createHash, randomBytes } from "node:crypto";

/**
 * Invite tokens — the at-rest form is a SHA-256 hash of the raw token.
 *
 * Why hash: invite links get stored in email, browser history, logs.
 * Previously the `pending_invites.token` column held the raw token,
 * so a DB snapshot leak let an attacker accept any pending invite.
 * Hashing at rest keeps the column useless without the original link.
 *
 * Raw tokens are 24 bytes (192 bits) of CSPRNG output — comfortably
 * more entropy than attackers can brute-force even against a weak
 * hash. We keep SHA-256 (no HMAC secret) because pre-image resistance
 * is sufficient here: attackers can't reverse a hash without the raw
 * token, and our rate limiter blunts online guessing.
 *
 * Storage convention: we overloaded the existing `token` text column
 * to store the *hash* (no schema migration needed). The raw token is
 * only ever transmitted to the user in the invite email. Any code
 * that previously read `invites.token` expecting the raw value is now
 * broken-by-design — look it up via `hashInviteToken(rawFromUrl)`.
 */

export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  return { raw, hash: hashInviteToken(raw) };
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
