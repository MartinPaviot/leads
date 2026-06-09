/**
 * Fetch a site's homepage and extract the signals the matcher needs. Runtime
 * I/O only: one GET, short timeout, graceful null on any failure (never throws
 * into the caller). Fetch + timeout are injectable for tests.
 *
 * Note: local dev behind a TLS interceptor needs NODE_EXTRA_CA_CERTS
 * (reference_local-tls-cert-bundle); prod on Vercel is fine. Bash in this repo
 * has no network egress, so this is exercised only via mocked fetch in tests.
 */

import type { PageSignals } from "./detect";

const UA = "ElevayTechDetect/1.0 (+https://www.elevay.dev)";

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxHtmlBytes?: number;
}

/** Normalise "example.com" / "http://x/y" → "https://host/". Null if unusable. */
export function toHomepageUrl(domain: string): string | null {
  const raw = (domain ?? "").trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    return null;
  }
  if (!host || !host.includes(".")) return null;
  return `https://${host}/`;
}

function hostOf(src: string, base: string): string | null {
  try {
    return new URL(src, base).host.toLowerCase();
  } catch {
    return null;
  }
}

export function extractScriptHosts(html: string, base: string): string[] {
  const hosts = new Set<string>();
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const h = hostOf(m[1], base);
    if (h) hosts.add(h);
  }
  return [...hosts];
}

export function extractMetaGenerator(html: string): string | null {
  const a = html.match(/<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']*)["']/i);
  if (a) return a[1];
  const b = html.match(/<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']generator["']/i);
  return b ? b[1] : null;
}

function headerMap(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function cookieNames(h: Headers): string[] {
  const getter = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw =
    typeof getter === "function"
      ? getter.call(h)
      : h.get("set-cookie")
        ? [h.get("set-cookie") as string]
        : [];
  return raw.map((c) => c.split(";")[0]?.split("=")[0]?.trim() ?? "").filter(Boolean);
}

export async function fetchSiteSignals(domain: string, deps: FetchDeps = {}): Promise<PageSignals | null> {
  const url = toHomepageUrl(domain);
  if (!url) return null;
  const f = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 6000);
  try {
    const res = await f(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, deps.maxHtmlBytes ?? 250_000);
    return {
      scriptHosts: extractScriptHosts(html, url),
      html,
      headers: headerMap(res.headers),
      cookies: cookieNames(res.headers),
      metaGenerator: extractMetaGenerator(html),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
