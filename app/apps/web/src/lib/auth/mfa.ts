/**
 * SOC2 T4 — MFA service over `user_mfa_secrets` (one row per auth user).
 *
 * Lifecycle: startMfaEnrollment (pending row, secret encrypted at rest)
 * -> confirmMfaEnrollment (first valid code proves the authenticator,
 * mints 10 single-use recovery codes, returned in plaintext exactly once)
 * -> verifyMfaCode at every credentials sign-in (TOTP with replay guard,
 * or one recovery code, consumed) -> disableMfa (route enforces password
 * or current-code reauth before calling).
 */

import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { userMfaSecrets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto/settings-encryption";
import {
  buildOtpauthUrl,
  generateTotpSecret,
  TOTP_STEP_SECONDS,
  verifyTotp,
} from "./totp";

const RECOVERY_CODE_COUNT = 10;

function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/[^0-9A-Z]/g, ""))
    .digest("hex");
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

async function getRow(userId: string) {
  const [row] = await db
    .select()
    .from(userMfaSecrets)
    .where(eq(userMfaSecrets.userId, userId))
    .limit(1);
  return row ?? null;
}

export interface MfaStatus {
  enabled: boolean;
  pending: boolean;
  recoveryCodesRemaining: number;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const row = await getRow(userId);
  if (!row) return { enabled: false, pending: false, recoveryCodesRemaining: 0 };
  const codes = row.backupCodes ? (JSON.parse(row.backupCodes) as string[]) : [];
  return {
    enabled: !!row.isVerified,
    pending: !row.isVerified,
    recoveryCodesRemaining: codes.length,
  };
}

/** Fast path used by the credentials authorize() — enabled means verified. */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const row = await getRow(userId);
  return !!row?.isVerified;
}

/**
 * Create (or replace a still-pending) enrollment. Refuses to overwrite a
 * VERIFIED enrollment — the route must require disable-then-re-enroll,
 * otherwise a hijacked session could silently swap the authenticator.
 */
export async function startMfaEnrollment(
  userId: string,
  accountEmail: string,
): Promise<{ otpauthUrl: string; manualKey: string }> {
  const existing = await getRow(userId);
  if (existing?.isVerified) {
    throw new Error("MFA already enabled — disable it before re-enrolling");
  }
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  if (existing) {
    await db
      .update(userMfaSecrets)
      .set({ secret: encrypted, backupCodes: null, createdAt: new Date() })
      .where(eq(userMfaSecrets.userId, userId));
  } else {
    await db.insert(userMfaSecrets).values({ userId, secret: encrypted });
  }
  return {
    otpauthUrl: buildOtpauthUrl(secret, accountEmail),
    // Grouped by 4 for readability in authenticator manual entry.
    manualKey: secret.replace(/(.{4})/g, "$1 ").trim(),
  };
}

/**
 * First valid code activates MFA and mints the recovery codes —
 * returned in plaintext exactly once, only SHA-256 digests are stored.
 */
export async function confirmMfaEnrollment(
  userId: string,
  code: string,
): Promise<{ recoveryCodes: string[] } | null> {
  const row = await getRow(userId);
  if (!row || row.isVerified) return null;
  const secret = decryptSecret(row.secret);
  const result = verifyTotp(code, secret);
  if (!result.valid) return null;
  const recoveryCodes = generateRecoveryCodes();
  await db
    .update(userMfaSecrets)
    .set({
      isVerified: true,
      backupCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
      lastUsedAt: new Date(result.matchedStep! * TOTP_STEP_SECONDS * 1000),
    })
    .where(eq(userMfaSecrets.userId, userId));
  return { recoveryCodes };
}

/**
 * Sign-in verification: a 6-digit TOTP (with replay refusal — the same
 * step can't be accepted twice) or a single-use recovery code.
 */
export async function verifyMfaCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const row = await getRow(userId);
  if (!row?.isVerified) return false;

  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ""))) {
    const secret = decryptSecret(row.secret);
    const result = verifyTotp(trimmed, secret);
    if (!result.valid) return false;
    const matchedAt = result.matchedStep! * TOTP_STEP_SECONDS * 1000;
    // Replay guard: refuse a code from a step at or before the last
    // accepted one.
    if (row.lastUsedAt && matchedAt <= row.lastUsedAt.getTime()) return false;
    await db
      .update(userMfaSecrets)
      .set({ lastUsedAt: new Date(matchedAt) })
      .where(eq(userMfaSecrets.userId, userId));
    return true;
  }

  // Recovery code path — consume on success.
  const hashes = row.backupCodes ? (JSON.parse(row.backupCodes) as string[]) : [];
  const candidate = hashRecoveryCode(trimmed);
  const idx = hashes.indexOf(candidate);
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  await db
    .update(userMfaSecrets)
    .set({ backupCodes: JSON.stringify(hashes), lastUsedAt: new Date() })
    .where(eq(userMfaSecrets.userId, userId));
  return true;
}

export async function disableMfa(userId: string): Promise<void> {
  await db.delete(userMfaSecrets).where(eq(userMfaSecrets.userId, userId));
}
