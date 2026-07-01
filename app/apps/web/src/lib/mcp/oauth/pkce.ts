/**
 * PKCE (RFC 7636) S256 verification — the ONLY thing preventing
 * authorization-code interception for a public client (Claude Desktop has
 * no client_secret). Pure, no DB/network.
 */
import { createHash, timingSafeEqual } from "crypto";

/** base64url without padding, per RFC 7636 §4.2. */
function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function computeS256Challenge(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}

/**
 * Verify a code_verifier (sent at /token) against the code_challenge
 * stored at /authorize time. Only S256 is supported — the "plain" method
 * (verifier === challenge) is explicitly NOT implemented: OAuth 2.1 drops
 * it, and supporting it would mean accepting an unhashed value as "proof",
 * defeating the point.
 */
export function verifyPkce(
  codeVerifier: string,
  storedChallenge: string,
  method: string,
): boolean {
  if (method !== "S256") return false;
  if (!codeVerifier || !storedChallenge) return false;
  const computed = computeS256Challenge(codeVerifier);
  const a = Buffer.from(computed);
  const b = Buffer.from(storedChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
