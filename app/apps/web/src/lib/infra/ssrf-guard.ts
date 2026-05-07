import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-safe URL validator.
 *
 * Rejects any URL that, once parsed and DNS-resolved, would cause our
 * server to open a connection to a local/internal network. Used before
 * any server-side `fetch()` where the destination is derived from user
 * input (e.g. `analyze-website` domain, attachment URLs).
 *
 * Blocked destinations:
 *  - Non-http(s) schemes (file://, gopher://, ftp://, data:, etc.)
 *  - IPv4 loopback (127.0.0.0/8), link-local (169.254.0.0/16),
 *    RFC1918 private (10/8, 172.16/12, 192.168/16), and
 *    CGNAT (100.64.0.0/10), broadcast (255.255.255.255),
 *    multicast (224/4), "this network" (0.0.0.0/8)
 *  - IPv6 loopback (::1), link-local (fe80::/10), unique-local
 *    (fc00::/7), unspecified (::)
 *  - Cloud instance metadata endpoints (169.254.169.254,
 *    fd00:ec2::254, metadata.google.internal)
 *  - Literal `localhost` hostname
 *
 * Note: DNS resolution here is "resolve once and use the result". A
 * TOCTOU-minded attacker could, in theory, flip a DNS record between
 * our check and the subsequent `fetch()`. To close that gap entirely
 * you'd need a fetch implementation that pins to the verified IP.
 * This helper is the first line of defense — it makes the easy
 * attacks (raw IP literals, metadata hostnames, private DNS names
 * like `neon.internal`) fail closed.
 */

const METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "instance-data.ec2.internal",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return true;
  const [a, b] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8 "this network"
  if (a === 10) return true;                         // 10/8
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12
  if (a === 192 && b === 168) return true;           // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true;             // 192.0.0/24 special-use
  if (a >= 224) return true;                         // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;   // fc00::/7
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped — re-check the embedded v4 address
    const v4 = normalized.slice("::ffff:".length);
    if (isIP(v4) === 4) return isPrivateIPv4(v4);
  }
  if (normalized === "fd00:ec2::254") return true; // EC2 IMDS v6
  return false;
}

export interface SsrfCheckResult {
  ok: boolean;
  /** When ok=true, the URL is safe to fetch. */
  url?: string;
  /** When ok=false, a short machine-readable reason. Never surface to users verbatim. */
  reason?: string;
}

/**
 * Validate that `input` is an http(s) URL whose hostname resolves to a
 * publicly-routable address. Returns a normalized URL string on success.
 *
 * `input` may be a bare domain (`acme.com`) or a full URL. Non-http(s)
 * schemes are rejected.
 */
export async function assertPublicUrl(
  input: string,
  opts: { allowHttp?: boolean } = {}
): Promise<SsrfCheckResult> {
  if (!input || typeof input !== "string") {
    return { ok: false, reason: "empty_input" };
  }

  let parsed: URL;
  try {
    // Bare domains ("acme.com") aren't valid URLs — prepend https://
    // when no scheme is present. `//` is treated as scheme-relative
    // which `URL` would reject; gate on an explicit colon check.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
    parsed = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const allowedProtocols = opts.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return { ok: false, reason: "scheme_not_allowed" };
  }

  // `URL.hostname` keeps IPv6 literals in brackets (`"[::1]"`), which
  // trip up `isIP` and DNS lookup. Strip them so the rest of the guard
  // sees a plain host.
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") && rawHost.endsWith("]")
    ? rawHost.slice(1, -1)
    : rawHost;
  if (!host) return { ok: false, reason: "no_host" };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost" };
  }
  if (METADATA_HOSTNAMES.has(host)) {
    return { ok: false, reason: "metadata_host" };
  }
  // Refuse `.internal`, `.local`, `.lan`, `.corp`, `.home` — these are
  // used for private DNS zones in k8s / corpnet / mDNS.
  const lastLabel = host.split(".").pop() ?? "";
  if (["internal", "local", "lan", "corp", "home", "localdomain"].includes(lastLabel)) {
    return { ok: false, reason: "private_tld" };
  }

  // Resolve IP literals directly; resolve DNS otherwise.
  const ipKind = isIP(host);
  if (ipKind === 4) {
    if (isPrivateIPv4(host)) return { ok: false, reason: "private_ipv4" };
  } else if (ipKind === 6) {
    if (isPrivateIPv6(host)) return { ok: false, reason: "private_ipv6" };
  } else {
    try {
      const resolved = await lookup(host, { all: true });
      for (const addr of resolved) {
        if (addr.family === 4 && isPrivateIPv4(addr.address)) {
          return { ok: false, reason: "resolves_to_private_ipv4" };
        }
        if (addr.family === 6 && isPrivateIPv6(addr.address)) {
          return { ok: false, reason: "resolves_to_private_ipv6" };
        }
      }
    } catch {
      // A hostname that fails DNS is no better than one that resolves
      // to a private address — reject rather than let the downstream
      // `fetch()` take the full 30 s timeout.
      return { ok: false, reason: "dns_failed" };
    }
  }

  return { ok: true, url: parsed.toString() };
}
