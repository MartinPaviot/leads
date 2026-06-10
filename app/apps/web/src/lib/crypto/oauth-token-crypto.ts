/**
 * At-rest encryption for OAuth tokens stored in `auth_account`
 * (access_token / refresh_token / id_token). These are mailbox- and
 * calendar-scoped credentials — a DB leak must not hand them out in
 * clear. Reuses the AES-256-GCM + `v1.` ciphertext format from
 * settings-encryption so the same ELEVAY_APP_SECRET protects both.
 *
 * Reads are tolerant: rows written before this existed hold plaintext
 * tokens, and `provider = 'credentials'` rows historically held bcrypt
 * hashes in `access_token` (H12). Anything that doesn't parse as a
 * `v1.<iv>.<ct>.<tag>` ciphertext is returned as-is, so legacy rows
 * keep working until the backfill (scripts/encrypt-oauth-tokens.ts)
 * has rewritten them.
 */

import { encryptSecret, decryptSecret } from "./settings-encryption";

function isCiphertext(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts[0] === "v1";
}

export function encryptOAuthToken(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  // Never double-encrypt (e.g. a refresh that echoes back the stored value).
  if (isCiphertext(token)) return token;
  return encryptSecret(token);
}

export function decryptOAuthToken(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  if (!isCiphertext(stored)) return stored; // legacy plaintext / bcrypt hash
  return decryptSecret(stored);
}

/** Decrypt the three token columns of an `auth_account` row in place-ish. */
export function decryptAccountTokens<
  T extends {
    access_token?: string | null;
    refresh_token?: string | null;
    id_token?: string | null;
  },
>(account: T): T {
  return {
    ...account,
    access_token: decryptOAuthToken(account.access_token),
    refresh_token: decryptOAuthToken(account.refresh_token),
    id_token: decryptOAuthToken(account.id_token),
  };
}
