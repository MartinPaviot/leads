/**
 * E14 — URL safety helper.
 *
 * Pure, no I/O. Validates a URL string against the small set of
 * dangerous schemes that show up in XSS payloads (javascript:, data:,
 * vbscript:, file:, and the deprecated about:blank vector) and returns
 * a normalised, trimmed string when it's safe to use as an `href` or
 * `src`, or `null` when the input is hostile or malformed.
 *
 * Used wherever we render a user-supplied or LLM-supplied URL —
 * outbound email link previews, signature parsing, knowledge-base
 * external refs, custom-field URL types, etc.
 *
 * Goals:
 *  - Reject every "javascript:" variant the WHATWG URL parser would
 *    otherwise resolve (whitespace, case, control chars, URL-encoded).
 *  - Allow http(s):// and bare-domain inputs ("acme.com") which we
 *    auto-prefix with `https://`.
 *  - Allow `mailto:` and `tel:` since both are common in CRM contexts
 *    and neither is exploitable.
 *  - Allow same-origin relative paths (start with `/`).
 *  - Return null on anything else — caller renders plain text instead.
 */

const DANGEROUS_SCHEMES = new Set([
  "javascript",
  "data",
  "vbscript",
  "file",
  "blob",
  "about",
]);

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Returns the safe-to-render version of `raw`, or `null` if it's
 * untrusted. The output is always trimmed and never contains control
 * characters; bare domains are normalised to https://example.com.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  // Strip ASCII control characters (incl. zero-width / tab / newline)
  // before scheme detection — `\tj\nava\rscript:alert(1)` resolves to
  // `javascript:` in a browser, and we need to catch that here.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (!cleaned) return null;

  // Same-origin relative path — no scheme to inspect.
  if (cleaned.startsWith("/") && !cleaned.startsWith("//")) {
    return cleaned;
  }

  // Pull out the scheme (everything before the first colon, with a
  // case-fold). If there's no colon we treat it as a bare domain and
  // try to normalise it below.
  const colon = cleaned.indexOf(":");
  const scheme = colon > 0 ? cleaned.slice(0, colon).toLowerCase() : "";

  if (scheme && DANGEROUS_SCHEMES.has(scheme)) return null;

  if (scheme === "mailto" || scheme === "tel") {
    // Don't try to parse — mailto:foo@bar and tel:+1234 don't fit URL().
    // Just confirm there's a non-empty payload after the colon.
    return cleaned.length > scheme.length + 1 ? cleaned : null;
  }

  // Bare domain → assume https. Conservative: only when it looks like
  // host.tld (at least one dot, no spaces, no scheme-ish prefix).
  if (!scheme && /^[A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z]{2,}(\/.*)?$/.test(cleaned)) {
    return `https://${cleaned}`;
  }

  if (!SAFE_SCHEMES.has(scheme)) return null;

  // For http(s), parse with URL() so we reject malformed inputs
  // (`https:///`, `http://[invalid`) and normalise the host case.
  try {
    const u = new URL(cleaned);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Convenience predicate for callers that just want a yes/no.
 */
export function isSafeUrl(raw: string | null | undefined): boolean {
  return safeUrl(raw) !== null;
}
