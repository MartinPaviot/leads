/**
 * URL verifier for signal factual grounding.
 *
 * MONACO-PARITY-01 Step 2 — anti-hallucination guard. When the signal
 * generator (or any other LLM-emitting code path) cites a `sourceUrl`,
 * we HEAD-check it before persisting so the founder never sees a
 * citation that resolves to 404. This module is the single source of
 * truth for "does this URL actually work?".
 *
 * Design choices:
 *
 * 1. **HEAD only.** No body download, no JS execution, no redirect
 *    following. Pure existence check. This bounds compute, network,
 *    and SSRF surface.
 *
 * 2. **5s timeout per request.** Slow servers shouldn't block signal
 *    generation. Timeouts return `unverified` with reason "timeout"
 *    so the founder can re-try later.
 *
 * 3. **Block private IPs at parse time.** No localhost / 10.0/8 /
 *    172.16/12 / 192.168/16 / 127/8 / fe80::/10 etc. Without this
 *    block we'd be a free port scanner for any attacker who can post
 *    a URL into our system.
 *
 * 4. **Treat "blocked-by-CDN" as verified.** LinkedIn returns 999, X
 *    returns 403 to anonymous HEAD — those URLs are well-formed and
 *    real, not hallucinations. We mark them `verified` rather than
 *    failing.
 *
 * 5. **No DB cache yet** (planned for the schema-bearing follow-up).
 *    For the helper-only milestone the function is pure — same input
 *    in, same outcome predicate (modulo upstream availability).
 *
 * The output enum is intentionally `verified | unverified` (binary)
 * rather than the 4-state `verified | likely | uncertain | unverified`.
 * The 4-state belongs to the signal-as-a-whole, computed downstream by
 * combining this binary URL outcome with the LLM's confidence and
 * presence/absence of a URL — see MONACO-PARITY-01 design.md §
 * "Generation pipeline change".
 */

const PRIVATE_IPV4_PREFIXES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

const BLOCKED_HOSTS = new Set<string>([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

/**
 * Hosts that consistently return non-2xx to anonymous HEAD but whose
 * URLs are well-formed and citable. We treat HEAD against these as
 * "verified" rather than failing — the LLM's citation is real, the
 * server is just hostile to scrapers.
 */
const TREAT_AS_VERIFIED_HOSTS = new Set<string>([
  "linkedin.com",
  "www.linkedin.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "crunchbase.com",
  "www.crunchbase.com",
]);

/**
 * Internal: classify a URL string before we even try to fetch.
 * Returns the parsed URL on success, or a structured rejection on
 * failure. Throwing is reserved for unexpected inputs (non-string).
 */
function parseAndValidate(rawUrl: string):
  | { ok: true; url: URL }
  | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `unsupported_protocol:${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "blocked_host" };

  // IPv4 numeric host check
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (PRIVATE_IPV4_PREFIXES.some((re) => re.test(host))) {
      return { ok: false, reason: "private_ipv4" };
    }
  }
  // IPv6 link-local / loopback (rough check — avoid third-party deps)
  if (host.startsWith("[fe80:") || host === "[::1]" || host === "::1") {
    return { ok: false, reason: "private_ipv6" };
  }

  return { ok: true, url };
}

export type UrlVerificationOutcome =
  | { status: "verified"; httpStatus: number; reason: "ok" | "blocked_cdn" }
  | { status: "unverified"; httpStatus: number | null; reason: string };

/**
 * HEAD-check `rawUrl` and classify the response.
 *
 * Never throws — always resolves to a verdict. Caller decides what to
 * do with `unverified` (drop, hide behind toggle, prompt founder).
 *
 * The promise resolves within `timeoutMs + ε` even if the upstream
 * server hangs.
 */
export async function verifySignalUrl(
  rawUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<UrlVerificationOutcome> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const parsed = parseAndValidate(rawUrl);
  if (!parsed.ok) {
    return { status: "unverified", httpStatus: null, reason: parsed.reason };
  }
  const { url } = parsed;

  const host = url.hostname.toLowerCase();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url.toString(), {
      method: "HEAD",
      signal: ctrl.signal,
      // Don't auto-follow redirects: a redirect chain to a private IP
      // would defeat parseAndValidate. We accept 3xx as "verified" if
      // it's a non-loop status — the redirect target is the LLM's
      // problem to cite separately.
      redirect: "manual",
    });

    if (res.status >= 200 && res.status < 400) {
      return { status: "verified", httpStatus: res.status, reason: "ok" };
    }

    // CDN-blocked but well-formed.
    if (
      TREAT_AS_VERIFIED_HOSTS.has(host) &&
      (res.status === 403 || res.status === 405 || res.status === 999)
    ) {
      return { status: "verified", httpStatus: res.status, reason: "blocked_cdn" };
    }

    return {
      status: "unverified",
      httpStatus: res.status,
      reason: `http_${res.status}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "unverified", httpStatus: null, reason: "timeout" };
    }
    return {
      status: "unverified",
      httpStatus: null,
      reason: err instanceof Error ? `fetch_error:${err.message.slice(0, 80)}` : "fetch_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
