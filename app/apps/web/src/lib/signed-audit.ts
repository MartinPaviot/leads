/**
 * Cryptographic integrity for audit trail entries.
 *
 * Every audit row gets an HMAC-SHA256 signature computed from a
 * canonical JSON representation of the entry fields. If someone
 * modifies a row directly in the database, `verifyAuditEntry` will
 * return `false` because the recomputed HMAC won't match.
 *
 * The signing key is `ELEVAY_APP_SECRET`. When the variable is unset
 * (local dev) the HMAC still runs but with an empty key so the code
 * path is exercised — production deploys must set the secret.
 */
import crypto from "crypto";

export interface AuditEntryPayload {
  action: string;
  entityType: string;
  entityId: string;
  tenantId: string;
  userId: string;
  timestamp: string;
  changes: Record<string, unknown>;
}

/**
 * Compute an HMAC-SHA256 hex digest for an audit entry.
 *
 * The payload is serialized with sorted keys so the signature is
 * deterministic regardless of property insertion order.
 */
export function signAuditEntry(entry: AuditEntryPayload): string {
  const payload = JSON.stringify(entry, Object.keys(entry).sort());
  return crypto
    .createHmac("sha256", process.env.ELEVAY_APP_SECRET || "")
    .update(payload)
    .digest("hex");
}

/**
 * Verify that a stored signature matches the recomputed HMAC for the
 * given entry fields. Returns `false` if the row was tampered with.
 */
export function verifyAuditEntry(
  entry: AuditEntryPayload,
  signature: string,
): boolean {
  const expected = signAuditEntry(entry);
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    // Length mismatch or invalid hex means tampered / corrupt
    return false;
  }
}
