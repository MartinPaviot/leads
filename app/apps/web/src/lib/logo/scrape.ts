/**
 * Tier 5 — homepage meta scrape for company logos.
 *
 * Fetches the target domain's homepage and extracts logo-candidate URLs
 * from (in priority order):
 *   1. <link rel="apple-touch-icon" href="…">
 *   2. <meta property="og:image" content="…">
 *   3. <link rel="icon" href="…"> (highest-res variant)
 *
 * Respects robots.txt (Martin's addition #3). If the homepage is
 * disallowed for our user-agent, the scrape is skipped entirely.
 *
 * Server-only — never imported on the client.
 */

import { getRobotsCache, setRobotsCache } from "./cache";

const UA = "Elevay-Logo-Resolver/1.0 (+https://elevay.com/bot)";
const SCRAPE_TIMEOUT_MS = 3000;
const ROBOTS_TIMEOUT_MS = 2000;

/** Check robots.txt for permission to scrape `/` on the given domain. */
export async function isScrapingAllowed(domain: string): Promise<boolean> {
  const cached = await getRobotsCache(domain);
  if (cached !== null) return cached === "allow";

  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) {
      // 404 / 5xx on robots.txt → treat as "no restrictions" per RFC 9309
      await setRobotsCache(domain, "allow");
      return true;
    }

    const text = await res.text();
    const disallowed = isPathDisallowed(text, "/", UA);
    const result = disallowed ? "disallow" : "allow";
    await setRobotsCache(domain, result);
    return result === "allow";
  } catch {
    // Timeout / network error → treat as "no restrictions"
    await setRobotsCache(domain, "allow");
    return true;
  }
}

/**
 * Minimal robots.txt parser per RFC 9309.
 * Checks if `path` is disallowed for a user-agent matching `ua`.
 * Only handles Disallow / Allow rules — sitemaps, crawl-delay, etc.
 * are ignored (we only need a yes/no on `/`).
 */
function isPathDisallowed(
  robotsTxt: string,
  path: string,
  ua: string,
): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  const uaLower = ua.toLowerCase();
  let inMatchingGroup = false;
  let bestMatch: { allow: boolean; specificity: number } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      if (line === "") inMatchingGroup = false;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === "user-agent") {
      const valLower = value.toLowerCase();
      inMatchingGroup = valLower === "*" || uaLower.includes(valLower);
      continue;
    }

    if (!inMatchingGroup) continue;

    if (directive === "disallow" && value && path.startsWith(value)) {
      if (!bestMatch || value.length > bestMatch.specificity) {
        bestMatch = { allow: false, specificity: value.length };
      }
    }
    if (directive === "allow" && value && path.startsWith(value)) {
      // RFC 9309: allow takes precedence at equal specificity
      if (!bestMatch || value.length >= bestMatch.specificity) {
        bestMatch = { allow: true, specificity: value.length };
      }
    }
  }

  return bestMatch ? !bestMatch.allow : false;
}

/** Scrape the homepage for logo-candidate URLs. */
export async function scrapeLogoFromHomepage(
  domain: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;

    // Only read the first 64KB to avoid downloading huge pages.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 64 * 1024;
    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(
      chunks.length === 1
        ? chunks[0]
        : new Uint8Array(
            chunks.reduce((buf, c) => {
              buf.set(c, buf.length - c.length);
              return buf;
            }, new Uint8Array(totalBytes)),
          ),
    );

    return extractLogoUrl(html, domain);
  } catch {
    return null;
  }
}

/**
 * Extract the best logo URL from raw HTML via regex.
 * Priority: apple-touch-icon > og:image > link-rel-icon.
 */
function extractLogoUrl(html: string, domain: string): string | null {
  // 1. apple-touch-icon (usually 180x180, best quality)
  const appleTouch =
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i.exec(
      html,
    ) ??
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i.exec(
      html,
    );
  if (appleTouch?.[1]) return resolveUrl(appleTouch[1], domain);

  // 2. og:image
  const ogImage =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    ) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
      html,
    );
  if (ogImage?.[1]) return resolveUrl(ogImage[1], domain);

  // 3. link rel="icon" (pick largest)
  const iconMatches = [
    ...html.matchAll(
      /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    ),
    ...html.matchAll(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi,
    ),
  ];
  if (iconMatches.length > 0) {
    // Prefer .png/.svg over .ico, prefer larger `sizes` attribute
    let best = iconMatches[0][1];
    let bestScore = 0;
    for (const m of iconMatches) {
      const href = m[0];
      let score = 0;
      if (/\.svg/i.test(href)) score += 100;
      if (/\.png/i.test(href)) score += 50;
      const sizeMatch = /sizes=["'](\d+)/i.exec(href);
      if (sizeMatch) score += parseInt(sizeMatch[1], 10);
      if (score > bestScore) {
        bestScore = score;
        best = m[1];
      }
    }
    if (best) return resolveUrl(best, domain);
  }

  return null;
}

function resolveUrl(href: string, domain: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://${domain}${href}`;
  return `https://${domain}/${href}`;
}

export { isPathDisallowed as _isPathDisallowed };
