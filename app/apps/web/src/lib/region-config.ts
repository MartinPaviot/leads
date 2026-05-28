/**
 * Sovereignty / region configuration — single source of truth.
 *
 * Used by:
 *   - db/index.ts (DB hostname assertion at boot)
 *   - lib/ai/ai-provider.ts (Anthropic EU endpoint pinning)
 *   - lib/geo-detect.ts (request-time EU detection)
 *   - inngest/health-checks.ts (continuous compliance check)
 *
 * The "EU/CH sovereign region" classification recognises:
 *   - AWS eu-central-1 (Frankfurt), eu-west-1/3 (Ireland/Paris)
 *   - Supabase EU pooler (aws-1-eu-central-1.pooler.supabase.com)
 *   - Neon EU (eu-central-1.aws.neon.tech, eu-west-1.aws.neon.tech)
 *   - Scaleway (fr-par.scw.cloud, nl-ams.scw.cloud)
 *   - OVH (gra*.ovh, sbg*.ovh, rbx*.ovh)
 *   - Clever Cloud (par.clever-cloud.com, rbx.clever-cloud.com)
 *   - Infomaniak (CH — ch-dk.infomaniak.cloud, *.infomaniak.com)
 *   - Exoscale (CH — ch-gva, ch-dk)
 *
 * Important: residency != sovereignty. AWS Frankfurt is residency-EU but
 * remains under US CLOUD Act because AWS is US-headquartered. The CLOUD
 * column in the sub-processor manifest captures that distinction; this
 * module only enforces hostname residency.
 */

/** Known EU/CH hostname patterns for managed DB / cache / queue providers. */
const EU_CH_HOST_PATTERNS: readonly string[] = [
  // AWS EU regions (used by Supabase, Neon, RDS, etc.)
  ".eu-central-1.aws.neon.tech",
  ".eu-west-1.aws.neon.tech",
  ".eu-central-1.neon.tech",
  ".eu-west-1.neon.tech",
  "eu-central-1.pooler.supabase.com",
  "eu-west-1.pooler.supabase.com",
  "eu-central-1.aws.amazonaws.com",
  "eu-west-1.amazonaws.com",
  "eu-west-3.amazonaws.com",
  // Scaleway (FR)
  ".scw.cloud",
  ".scaleway.com",
  // OVH (FR)
  ".ovh.net",
  ".ovh.io",
  ".cloud.ovh.net",
  // Clever Cloud (FR)
  ".clever-cloud.com",
  // Infomaniak (CH)
  ".infomaniak.cloud",
  ".infomaniak.com",
  // Exoscale (CH)
  ".exo.io",
  ".exoscale.com",
  // Upstash EU
  ".eu-central-1.upstash.io",
  ".eu-west-1.upstash.io",
  // Local development
  "localhost",
  "127.0.0.1",
];

/**
 * Anthropic endpoint allowlist. Used by ai-provider to refuse unknown
 * base URLs at startup (prevents SSRF via env injection).
 */
export const ANTHROPIC_EU_BASE_URL = "https://eu.anthropic.com";
export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";

/** ISO 3166-1 alpha-2 codes considered EU/EEA/equivalent for privacy purposes. */
export const EU_COUNTRY_CODES: ReadonlySet<string> = new Set([
  // EU
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA / EFTA
  "IS", "LI", "NO",
  // Switzerland — nFADP, treated as EU-equivalent
  "CH",
  // UK — post-Brexit, kept on EU-equivalent track for our purposes
  "GB",
]);

/** Email TLDs we treat as EU as a last-resort fallback. */
export const EU_EMAIL_TLDS: ReadonlySet<string> = new Set([
  "fr", "de", "es", "it", "pt", "nl", "be", "lu", "at", "pl", "se", "fi",
  "dk", "no", "ie", "gr", "cz", "hu", "ro", "bg", "hr", "si", "sk", "ee",
  "lt", "lv", "mt", "cy",
  "ch", // Switzerland
  "uk", "co.uk", // UK
  "eu", // pan-European
]);

/**
 * Returns true if the hostname appears to be hosted in an EU/CH region we
 * recognise. The list is curated; unknown hosts return false.
 */
export function isEuHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return EU_CH_HOST_PATTERNS.some((p) => h === p || h.endsWith(p));
}

/**
 * Mask the project/account-identifier subdomain in a hostname so we never
 * log it (used in startup warnings).
 */
export function maskHostname(hostname: string): string {
  return hostname.replace(/^[^.]+/, "***");
}

export interface RegionAssertionResult {
  ok: boolean;
  hostname: string | null;
  reason?: string;
}

/**
 * Assert that a URL (DB connection string, Redis, etc.) points to an EU/CH
 * host when GDPR_REGION=eu. Returns a structured result; the caller decides
 * whether to throw, warn, or surface to a health check.
 */
export function assertEuHost(connectionUrl: string): RegionAssertionResult {
  try {
    const u = new URL(connectionUrl);
    const hostname = u.hostname.toLowerCase();
    if (isEuHost(hostname)) return { ok: true, hostname };
    return {
      ok: false,
      hostname,
      reason: `host "${maskHostname(hostname)}" not in EU/CH allowlist`,
    };
  } catch {
    return { ok: false, hostname: null, reason: "URL parse failed" };
  }
}

/** True when sovereignty/EU enforcement is requested by env. */
export function isEuEnforcementEnabled(): boolean {
  return process.env.GDPR_REGION?.toLowerCase() === "eu";
}

/**
 * Run all region assertions at boot. Used by health checks / startup.
 * Returns a list so all failures surface at once.
 */
export interface EndpointCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function validateAllEndpoints(): EndpointCheck[] {
  const out: EndpointCheck[] = [];

  if (process.env.DATABASE_URL) {
    const r = assertEuHost(process.env.DATABASE_URL);
    out.push({
      name: "DATABASE_URL",
      ok: r.ok,
      detail: r.ok ? `EU host (${maskHostname(r.hostname!)})` : (r.reason ?? "fail"),
    });
  }

  if (process.env.REDIS_URL) {
    const r = assertEuHost(process.env.REDIS_URL);
    // Local redis is acceptable in dev only.
    const isLocal = r.hostname === "localhost" || r.hostname === "127.0.0.1";
    const ok = r.ok || (isLocal && process.env.NODE_ENV !== "production");
    out.push({
      name: "REDIS_URL",
      ok,
      detail: ok ? `host ok (${r.hostname ?? "unknown"})` : (r.reason ?? "fail"),
    });
  }

  // Anthropic endpoint
  const baseUrl =
    process.env.ANTHROPIC_API_BASE ??
    (process.env.ANTHROPIC_REGION?.toLowerCase() === "eu"
      ? ANTHROPIC_EU_BASE_URL
      : ANTHROPIC_DEFAULT_BASE_URL);
  out.push({
    name: "ANTHROPIC_BASE_URL",
    ok: baseUrl === ANTHROPIC_EU_BASE_URL,
    detail: baseUrl === ANTHROPIC_EU_BASE_URL ? "EU endpoint" : `non-EU: ${baseUrl}`,
  });

  // Sentry DSN — should contain `.de.sentry.io` for EU region
  const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn) {
    const ok = /\.de\.sentry\.io/i.test(sentryDsn);
    out.push({
      name: "SENTRY_DSN",
      ok,
      detail: ok ? "EU (de.sentry.io)" : "not pinned to de.sentry.io",
    });
  }

  // PostHog host
  const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (phHost) {
    const ok = /eu\.i\.posthog\.com/i.test(phHost);
    out.push({
      name: "POSTHOG_HOST",
      ok,
      detail: ok ? "EU cloud" : "not pinned to eu.i.posthog.com",
    });
  }

  return out;
}
