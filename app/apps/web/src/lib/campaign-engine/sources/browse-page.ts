import * as cheerio from "cheerio";

/**
 * P1-9 — targeted page crawler the research agent drives. Unlike
 * scrapeCompanyWebsite (homepage only, no link-following), browsePage fetches an
 * arbitrary page WITHIN the company's root domain and returns its internal links
 * so the model can ask for /pricing, /about, /customers next.
 *
 * It is the only model-driven network surface, so it is hardened: http(s) only,
 * host must be the root domain or a subdomain, private/loopback hosts blocked,
 * and the host is re-checked AFTER redirects (anti-SSRF / anti-scope-drift).
 */

export interface BrowsePageResult {
  url: string;
  title: string | null;
  headings: string[];
  mainText: string; // truncated to 3000 chars, like website.ts
  internalLinks: string[]; // same-domain, deduped, max 20
  fetchedAt: string;
}

export type BrowseOutcome =
  | { ok: true; page: BrowsePageResult }
  | { ok: false; error: "out_of_scope" | "blocked_host" | "fetch_failed" | "not_html" };

/** Strip protocol/path/port, lower-case — the host we scope to. */
export function rootHostOf(rootDomain: string): string {
  let h = rootDomain.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return h.replace(/^www\./, "");
}

/** host === root OR a subdomain of root (foo.root) — never a different domain. */
export function hostInScope(host: string, rootHost: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === rootHost || h.endsWith("." + rootHost);
}

/** Block loopback / private / link-local IP literals + localhost (SSRF). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h.endsWith(".localhost")) return true;
  if (/^127\./.test(h)) return true; // loopback
  if (/^10\./.test(h)) return true; // private A
  if (/^192\.168\./.test(h)) return true; // private C
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; // private B
  if (/^169\.254\./.test(h)) return true; // link-local
  if (/^(0|::|\[::1\])$/.test(h)) return true;
  return false;
}

function resolveTarget(rootDomain: string, target: string): URL | null {
  try {
    if (/^https?:\/\//i.test(target)) return new URL(target);
    const origin = rootDomain.startsWith("http") ? rootDomain : `https://${rootHostOf(rootDomain)}`;
    return new URL(target, origin.endsWith("/") ? origin : origin + "/");
  } catch {
    return null;
  }
}

/**
 * @param rootDomain the company's root domain (scope boundary)
 * @param target absolute URL or a path relative to the root domain
 */
export async function browsePage(rootDomain: string, target: string): Promise<BrowseOutcome> {
  const rootHost = rootHostOf(rootDomain);
  const u = resolveTarget(rootDomain, target);
  if (!u) return { ok: false, error: "out_of_scope" };
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "out_of_scope" };
  if (isBlockedHost(u.hostname)) return { ok: false, error: "blocked_host" };
  if (!hostInScope(u.hostname, rootHost)) return { ok: false, error: "out_of_scope" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    // Re-check the host AFTER any redirect — a 30x off-domain must not pass.
    const finalUrl = new URL(res.url || u.toString());
    if (isBlockedHost(finalUrl.hostname)) return { ok: false, error: "blocked_host" };
    if (!hostInScope(finalUrl.hostname, rootHost)) return { ok: false, error: "out_of_scope" };

    if (!res.ok) return { ok: false, error: "fetch_failed" };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return { ok: false, error: "not_html" };

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim() || null;

    // Internal links BEFORE stripping nav/footer (that's where they live).
    const internalLinks: string[] = [];
    const seen = new Set<string>();
    $("a[href]").each((_, el) => {
      if (internalLinks.length >= 20) return;
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const linkUrl = new URL(href, finalUrl);
        if (linkUrl.protocol !== "http:" && linkUrl.protocol !== "https:") return;
        if (!hostInScope(linkUrl.hostname, rootHost) || isBlockedHost(linkUrl.hostname)) return;
        const clean = linkUrl.origin + linkUrl.pathname.replace(/\/$/, "");
        if (clean === (finalUrl.origin + finalUrl.pathname.replace(/\/$/, ""))) return; // skip self
        if (!seen.has(clean)) {
          seen.add(clean);
          internalLinks.push(clean);
        }
      } catch {
        /* skip malformed href */
      }
    });

    $("script, style, nav, footer, header, iframe, noscript").remove();
    const headings: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) headings.push(text);
    });
    const mainText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);

    return {
      ok: true,
      page: {
        url: finalUrl.toString(),
        title,
        headings: headings.slice(0, 12),
        mainText,
        internalLinks,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: "fetch_failed" };
  }
}
