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

import { classifyLink, riskChipLabel } from "./link-safety";

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
// Any remote url(...) inside an inline style — background images, list/cursor,
// border-image. All are silent remote fetches (tracking beacons), so they get
// the same default-block-then-proxy treatment as <img src> (INBOX-R07).
const REMOTE_CSS_URL_RE = /url\(\s*['"]?\s*(https?:\/\/[^'")\s]+)\s*['"]?\s*\)/gi;

/**
 * Neutralize (or, on explicit load, proxy) every remote `url(...)` in an inline
 * style so a CSS background beacon can't leak the recipient's IP / "opened"
 * signal. Increments `counts.remote` per withheld url so the "load images" banner
 * accounts for them too.
 */
function neutralizeRemoteCssUrls(
  style: string,
  opts: EmailPrivacyOptions,
  counts: { remote: number; links: number },
): string {
  return style.replace(REMOTE_CSS_URL_RE, (match, url: string) => {
    if (opts.loadRemoteImages) {
      return opts.proxyBase ? `url("${opts.proxyBase + encodeURIComponent(url)}")` : match;
    }
    counts.remote++;
    return "none"; // valid CSS for background/background-image — no fetch
  });
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
 * Delegates to the richer classifier (link-safety.ts) so the body-level banner's
 * notion of "misleading" stays in lock-step with the per-link chips. A merely
 * neutralized/disabled scheme is not "suspicious link text", so it is excluded.
 */
export function isSuspiciousLink(text: string, href: string): boolean {
  return classifyLink(href, text).risks.some((r) => r !== "dangerous-scheme");
}

function walk(node: Node, opts: EmailPrivacyOptions, counts: { remote: number; links: number }): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    // Remote CSS background beacons get the same privacy treatment as <img> (R07).
    const style = el.getAttribute("style");
    if (style && /url\(\s*['"]?\s*https?:/i.test(style)) {
      el.setAttribute("style", neutralizeRemoteCssUrls(style, opts, counts));
    }

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
      const safety = classifyLink(href, el.textContent || "");
      // Hover/focus preview of the true destination on EVERY link (R03): benign
      // links get a quiet "Goes to <host>", risky ones get the warning reason.
      if (safety.realHost) {
        el.setAttribute("title", safety.risky && safety.reason ? safety.reason : `Goes to ${safety.realHost}`);
      }
      if (safety.risky) {
        el.setAttribute("data-suspicious", "true");
        counts.links++;
        // Inline per-link warning chip — the deception is flagged at the point of
        // decision, not just in the body-level banner. Tokens drive light/dark.
        const doc = el.ownerDocument;
        if (doc) {
          const chip = doc.createElement("span");
          chip.setAttribute("data-link-warn", "true");
          if (safety.reason) chip.setAttribute("title", safety.reason);
          chip.setAttribute(
            "style",
            "display:inline-flex;align-items:center;margin-left:4px;padding:0 4px;border-radius:4px;font-size:11px;line-height:1.5;white-space:nowrap;background:var(--color-warning-soft);color:var(--color-warning);",
          );
          chip.textContent = riskChipLabel(safety) ?? "check link";
          el.after(chip);
        }
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
