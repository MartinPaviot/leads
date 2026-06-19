/**
 * SSRF guard for the inbox image proxy (INBOX-R02). Pure + unit-tested.
 *
 * The proxy fetches an arbitrary URL from an email and streams it back, so it
 * must never be coaxed into reaching internal infrastructure (cloud metadata,
 * localhost, private ranges). Two layers use this:
 *   - `isUrlSafeForProxy` — validates the URL shape + any IP literal up front.
 *   - `isPrivateIp`       — re-checked in the route against the RESOLVED address
 *     (defends against DNS rebinding, where a public hostname resolves to a
 *     private IP).
 */

/** Private / loopback / link-local / reserved IPv4 — never proxy to these. */
export function isPrivateIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const o = m.slice(1).map((n) => parseInt(n, 10));
  if (o.some((n) => n > 255)) return true; // malformed → treat as unsafe
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Any IP literal we refuse to proxy. IPv6 literals are blocked wholesale —
 *  image hosts use DNS names, so allowing raw IPv6 only adds SSRF surface. */
export function isPrivateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  if (h.includes(":")) return true; // any IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIpv4(h);
  return false;
}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp"];

/**
 * Gate a remote URL before proxying. Allows only http/https on default ports to
 * a public, multi-label DNS name or a public IPv4 literal.
 */
export function isUrlSafeForProxy(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  if (url.username || url.password) return false; // no embedded creds

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (host === "localhost") return false;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return false;

  // IP literal → must be a public IPv4 (IPv6 blocked wholesale).
  if (/[:]/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return !isPrivateIp(host);
  }
  // DNS name → require a dot (reject single-label internal hostnames).
  if (!host.includes(".")) return false;
  return true;
}
