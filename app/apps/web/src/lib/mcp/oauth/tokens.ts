/**
 * Opaque bearer token generation + hashing for the MCP OAuth provider.
 * Tokens are stored as SHA-256 hashes (see db/schema/mcp-oauth.ts's
 * docstring for why hash-and-compare, not reversible encryption, is right
 * here) — the raw value is only ever shown to the client once, at
 * issuance, exactly like a password is never stored plaintext.
 */
import { randomBytes, createHash } from "crypto";

const TOKEN_BYTES = 32; // 256 bits

/** A cryptographically random opaque token, base64url-encoded. */
export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest — the only form ever persisted. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** A short-lived authorization code (RFC 6749 §4.1) — same generation as a token. */
export function generateAuthorizationCode(): string {
  return generateOpaqueToken();
}
