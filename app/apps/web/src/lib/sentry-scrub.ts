import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Sentry `beforeSend` hook that strips PII and secrets.
 *
 * What we're protecting against:
 *  - User emails, IPs, and NextAuth session claims flowing to a 3rd-
 *    party processor (GDPR Art. 28 / SOC 2 CC6.7 concerns).
 *  - Secrets sneaking into exception messages — a stray `Authorization`
 *    header or bcrypt hash that ends up in an error string propagates
 *    to Sentry verbatim by default.
 *
 * Strategy:
 *  1. Null out the `user` object (no email, IP, or id leaving our infra).
 *  2. Drop common PII-bearing request headers (`cookie`, `authorization`).
 *  3. Walk every string in exception messages / breadcrumbs and redact
 *     any token-shaped substring (bearer, sk_, whsec_, Bcrypt $2a$, JWT).
 *
 * Kept side-effect-free and dependency-free so it's safe to reuse from
 * the edge runtime.
 */

const REDACTED = "[redacted]";

// Order matters: stronger matchers first so a bearer token inside a
// JWT-shaped string doesn't slip through the JWT pattern.
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Authorization: Bearer <anything>
  [/Bearer\s+[A-Za-z0-9._~+\/=-]{10,}/gi, `Bearer ${REDACTED}`],
  // Stripe live/test keys + OpenAI keys — same `sk_` shape.
  [/\bsk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}/g, REDACTED],
  [/\bpk[-_](?:live|test)?[-_]?[A-Za-z0-9]{16,}/g, REDACTED],
  // AWS access key IDs
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  // Svix / generic webhook secrets
  [/\bwhsec_[A-Za-z0-9+\/=]{20,}/g, REDACTED],
  // JWTs (three base64url segments separated by dots)
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, REDACTED],
  // bcrypt hashes
  [/\$2[aby]?\$\d{2}\$[A-Za-z0-9.\/]{50,}/g, REDACTED],
  // Email addresses (loose — we'd rather over-redact than leak PII)
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED],
];

function scrubString(value: string): string {
  let out = value;
  for (const [re, replacement] of SECRET_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function scrubDeep<T>(input: T): T {
  if (typeof input === "string") return scrubString(input) as unknown as T;
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(scrubDeep) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    // Drop known-PII-heavy keys outright rather than try to scrub them.
    if (["cookie", "authorization", "set-cookie", "password", "token", "refresh_token", "access_token"].includes(k.toLowerCase())) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = scrubDeep(v);
  }
  return out as unknown as T;
}

// @sentry/nextjs narrowed the `beforeSend` callback signature to
// `ErrorEvent` (vs the older generic `Event` which spanned errors +
// transactions). Transactions go through `beforeSendTransaction`, so
// the ErrorEvent type is correct here for all three (server / client
// / edge) bootstrap files.
export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  // Drop user identity entirely — Sentry will still correlate by
  // server-generated transaction/trace IDs.
  if (event.user) {
    event.user = { id: undefined, email: undefined, ip_address: undefined };
  }

  if (event.request) {
    const { headers, data, cookies, query_string, ...rest } = event.request;
    event.request = {
      ...rest,
      headers: headers ? scrubDeep(headers) : headers,
      data: data ? scrubDeep(data) : data,
      cookies: undefined,
      query_string: typeof query_string === "string" ? scrubString(query_string) : query_string,
    };
  }

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      message: bc.message ? scrubString(bc.message) : bc.message,
      data: bc.data ? scrubDeep(bc.data) : bc.data,
    }));
  }

  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.contexts) event.contexts = scrubDeep(event.contexts);
  if (event.tags) event.tags = scrubDeep(event.tags);

  return event;
}
