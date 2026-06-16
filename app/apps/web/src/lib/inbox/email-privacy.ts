/**
 * Privacy + safety policy for already-sanitized email HTML (INBOX-R02/R03/R07).
 *
 * Runs AFTER `sanitizeEmailHtml` (which guarantees no executable markup), so this
 * layer only reasons about benign content: remote images, tracking pixels, and
 * link trustworthiness. Separated from sanitization because these are *policy*
 * (some user-toggleable) rather than *security* (always enforced):
 *
 *  - R07 tracking pixels  → always removed (1x1 / zero-area open-trackers).
 *  - R02 remote images    → blocked by default (no auto-load ⇒ no IP / "opened"
 *    leak to the sender); on explicit load they are rewritten through our proxy
 *    so even then the sender sees our server, not the recipient.
 *  - R03 links            → flagged (not blocked) when the visible text claims a
 *    different domain than the destination, or the host is a raw IP / punycode.
 *
 * DOM-based, so it runs in the browser (the reading pane is a client component).
 * On the server (no DOM) it is a no-op pass-through with zero counts.
 */

export interface EmailPrivacyOptions {
  /** false (default) blocks remote images; true loads them (through the proxy). */
  loadRemoteImages?: boolean;
  /** Proxy prefix, e.g. "/api/inbox/image-proxy?url=". When set, loaded remote
   *  images are routed through it so the sender never sees the recipient's IP. */
  proxyBase?: string;
}

export interface EmailPrivacyResult {
  html: string;
  /** Remote images currently withheld (drives the "load images" banner). */
  blockedRemoteImages: number;
  /** Links whose text/destination disagree, or whose host is an IP / punycode. */
  suspiciousLinks: number;
}

const REMOTE_SRC = /^https?:\/\//i;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|:|^\[/; // IPv4 literal, or any colon (IPv6), or [..]
const DOMAIN_IN_TEXT = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i;

/** Common multi-part public suffixes, so `bank.co.uk` ≠ `phish.co.uk` instead of
 *  both collapsing to `co.uk`. Not the full PSL (that needs a dependency) — just
 *  the suffixes a phisher is most likely to hide behind. */
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk",
  "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.il",
  "com.au", "net.au", "org.au", "com.br", "com.cn", "com.mx", "com.tr", "com.sg",
]);

/** PSL-free "registrable-ish" comparator: the registrable domain, handling the
 *  common multi-part TLDs. Catches the phishing case where the visible domain
 *  differs from the destination domain. */
function registrableish(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length >= 3 && MULTI_PART_TLDS.has(labels.slice(-2).join("."))) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Is an <img> a tracking pixel? Zero/one-px in width|height attr or inline style. */
function isTrackingPixel(el: Element): boolean {
  const dim = (v: string | null): number | null => {
    if (!v) return null;
    const n = parseInt(v.replace(/px$/i, ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  const w = dim(el.getAttribute("width"));
  const h = dim(el.getAttribute("height"));
  if ((w !== null && w <= 1) || (h !== null && h <= 1)) return true;
  const style = (el.getAttribute("style") || "").toLowerCase();
  // Match width/height with px/pt or no unit (trackers use "0", "1px", "0pt").
  const sw = /(?:^|[;\s])width\s*:\s*([0-9.]+)\s*(?:px|pt)?\b/.exec(style);
  const sh = /(?:^|[;\s])height\s*:\s*([0-9.]+)\s*(?:px|pt)?\b/.exec(style);
  if (sw && parseFloat(sw[1]) <= 1) return true;
  if (sh && parseFloat(sh[1]) <= 1) return true;
  return false;
}

/**
 * Decide whether a link is misleading. Pure + exported for unit testing.
 * Suspicious when: the destination host is a raw IP or punycode, OR the visible
 * text names a domain whose registrable-ish form differs from the destination's.
 */
export function isSuspiciousLink(text: string, href: string): boolean {
  const host = hostOf(href);
  if (!host) return false; // unparseable/relative — not our concern here
  if (IP_HOST.test(host)) return true;
  if (host.toLowerCase().includes("xn--")) return true; // punycode / IDN homograph

  const m = DOMAIN_IN_TEXT.exec(text || "");
  if (m) {
    const textHost = m[1];
    if (registrableish(textHost) !== registrableish(host)) return true;
  }
  return false;
}

function walk(node: Node, opts: EmailPrivacyOptions, counts: { remote: number; links: number }): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "img") {
      if (isTrackingPixel(el)) {
        el.remove();
        continue;
      }
      const src = el.getAttribute("src") || "";
      if (REMOTE_SRC.test(src)) {
        if (opts.loadRemoteImages) {
          if (opts.proxyBase) el.setAttribute("src", opts.proxyBase + encodeURIComponent(src));
        } else {
          el.removeAttribute("src");
          el.setAttribute("data-blocked-src", src);
          counts.remote++;
        }
      }
      continue;
    }

    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      if (isSuspiciousLink(el.textContent || "", href)) {
        el.setAttribute("data-suspicious", "true");
        el.setAttribute("title", `Link text doesn't match its destination (${hostOf(href) ?? "unknown"})`);
        counts.links++;
      }
      continue;
    }

    walk(el, opts, counts);
  }
}

export function applyEmailPrivacy(safeHtml: string, opts: EmailPrivacyOptions = {}): EmailPrivacyResult {
  if (!safeHtml) return { html: "", blockedRemoteImages: 0, suspiciousLinks: 0 };
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // No DOM (SSR): pass through. The reading pane re-runs this on the client.
    return { html: safeHtml, blockedRemoteImages: 0, suspiciousLinks: 0 };
  }
  const doc = new DOMParser().parseFromString(safeHtml, "text/html");
  const counts = { remote: 0, links: 0 };
  walk(doc.body, opts, counts);
  return {
    html: doc.body.innerHTML,
    blockedRemoteImages: counts.remote,
    suspiciousLinks: counts.links,
  };
}
