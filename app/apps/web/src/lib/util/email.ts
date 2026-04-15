/**
 * Canonicalise an email address for equality comparison.
 *
 * Used to match participants exposed to the Elevay Notetaker against tenant
 * signups, which would otherwise miss matches due to trivial formatting
 * differences (caps, plus-tags, Gmail dots).
 *
 * Normalisation rules:
 *   1. Lowercase + trim.
 *   2. Strip everything from the first `+` in the local-part (most providers).
 *   3. For Gmail and Googlemail, strip dots from the local-part and collapse
 *      `googlemail.com` onto `gmail.com`.
 *
 * Throws on inputs that cannot be parsed as a single `local@domain` address.
 */
export function normalizeEmail(email: string): string {
  if (typeof email !== "string") throw new Error("normalizeEmail: input must be a string");

  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0) throw new Error("normalizeEmail: empty");
  if (trimmed.length > 254) throw new Error("normalizeEmail: exceeds RFC 5321 length");

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex !== trimmed.lastIndexOf("@")) {
    throw new Error(`normalizeEmail: malformed address "${email}"`);
  }

  let local = trimmed.slice(0, atIndex);
  let domain = trimmed.slice(atIndex + 1);

  if (local.length === 0 || domain.length === 0) {
    throw new Error(`normalizeEmail: malformed address "${email}"`);
  }

  // Strip plus-tag (everything from the first +)
  const plusIndex = local.indexOf("+");
  if (plusIndex >= 0) local = local.slice(0, plusIndex);

  // Collapse Gmail aliases and strip dots
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");

  // Local part must survive these transformations with at least 1 char
  if (local.length === 0) {
    throw new Error(`normalizeEmail: local part empty after normalisation "${email}"`);
  }

  return `${local}@${domain}`;
}

/**
 * Extract the domain from an email, lowercased. Returns null on malformed input
 * rather than throwing — callers are typically in best-effort paths.
 */
export function extractDomain(email: string): string | null {
  if (typeof email !== "string") return null;
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}
