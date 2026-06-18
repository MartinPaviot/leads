/**
 * Email-grade HTML sanitization for the inbox reading pane (INBOX-R01).
 *
 * Two layers, defence-in-depth:
 *  - `stripDangerousHtml` — server-safe, no DOM. Runs at CAPTURE time so a
 *    hostile payload never even lands in the database with executable markup.
 *    Conservative: removes whole dangerous containers (script/style/head/…)
 *    rather than unwrapping them (the bug in the generic `infra/sanitize-html`
 *    server path, which would surface raw CSS as visible text).
 *  - `sanitizeEmailHtml` — authoritative, DOM-based. Runs in the BROWSER at
 *    RENDER time (the reading pane is a client component, so `DOMParser` is
 *    available and there is no SSR hydration of the body). Enforces a tag +
 *    attribute allowlist, neutralises `javascript:`/`data:` URLs, and strips
 *    layout-escape CSS. No third-party dependency — the platform DOM does the
 *    parsing; we only apply policy.
 *
 * Remote-image privacy proxying and tracking-pixel blocking are deliberately
 * out of scope here — they layer on top in INBOX-R02 / R07.
 */

/** Tags whose CONTENT is dropped entirely (never unwrapped). */
const DROP_WITH_CONTENT = [
  "script",
  "style",
  "head",
  "title",
  "link",
  "meta",
  "base",
  "noscript",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
];

/** Tags kept (unknown tags are unwrapped — children preserved, tag dropped). */
const ALLOWED_TAGS = new Set([
  "p", "br", "b", "i", "u", "s", "strong", "em", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "col", "colgroup",
  "img", "hr", "sub", "sup", "small", "font", "center", "abbr", "mark", "dl", "dt", "dd",
]);

/** Attributes kept on any allowed tag. Everything else (incl. `on*`) is dropped. */
const ALLOWED_ATTR = new Set([
  "href", "src", "alt", "title", "width", "height", "align", "valign",
  "colspan", "rowspan", "style", "class", "dir", "bgcolor", "color", "cellpadding",
  "cellspacing", "border",
]);

// No data: link has a legitimate use in mail, so every data: (and vbscript:/file:/
// blob:/about:) href is neutralized (INBOX-R03). For <img src>, inline data:image
// stays (it is harmless and used for embedded logos) EXCEPT data:image/svg, which
// can carry script.
const UNSAFE_HREF = /^\s*(?:javascript:|vbscript:|data:|file:|about:|blob:)/i;
const UNSAFE_SRC = /^\s*(?:javascript:|vbscript:|data:text\/html|data:application|data:image\/svg)/i;
/** CSS properties/values that can break out of the email's box or run code. */
const UNSAFE_CSS = /(position\s*:\s*(fixed|absolute|sticky))|(expression\s*\()|(url\s*\(\s*['"]?\s*(javascript|vbscript):)|(-moz-binding)|(behavior\s*:)/gi;

/**
 * Server-safe pre-strip (no DOM). Removes whole dangerous containers and inline
 * event handlers. Not a full allowlist — that is enforced at render by
 * `sanitizeEmailHtml`; this just guarantees nothing executable is persisted.
 */
export function stripDangerousHtml(dirty: string): string {
  if (!dirty) return "";
  let out = dirty;
  for (const tag of DROP_WITH_CONTENT) {
    // <tag …>…</tag>
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    // self-closing / void form <tag …/> or <tag …>
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  // inline event handlers (onclick=…, onload=…) and javascript: protocol
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
  return out;
}

/** Sanitize one inline `style` attribute value, dropping layout-escape/code CSS. */
function sanitizeStyle(value: string): string {
  return value.replace(UNSAFE_CSS, "").trim();
}

function walk(node: Node): void {
  // Snapshot children first — the list mutates as we prune.
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.includes(tag)) {
      el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep the (sanitized) children, drop the tag itself.
      walk(el);
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTR.has(name) || name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        const cleaned = sanitizeStyle(attr.value);
        if (cleaned) el.setAttribute("style", cleaned);
        else el.removeAttribute("style");
      }
      if (name === "href" && UNSAFE_HREF.test(attr.value)) {
        el.setAttribute("href", "#");
      }
      if (name === "src" && UNSAFE_SRC.test(attr.value)) {
        el.setAttribute("src", "");
      }
    }

    if (tag === "a") {
      el.setAttribute("rel", "noopener noreferrer nofollow");
      el.setAttribute("target", "_blank");
    }

    walk(el);
  }
}

/**
 * Authoritative DOM sanitizer. Call from a client component (browser DOM).
 * Falls back to the conservative server strip when no DOM is present, so it is
 * always safe to call — but the allowlist is only enforced where a DOM exists.
 */
export function sanitizeEmailHtml(dirty: string): string {
  if (!dirty) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return stripDangerousHtml(dirty);
  }
  const doc = new DOMParser().parseFromString(dirty, "text/html");
  walk(doc.body);
  return doc.body.innerHTML;
}

const HTML_MARKUP =
  /<(?:html|body|head|div|p|br|table|tr|td|span|a|img|ul|ol|li|h[1-6]|blockquote|strong|em|b|i|font|center|pre)\b[^>]*>|<\/[a-z][a-z0-9]*>|<!doctype html/i;

/**
 * Heuristic: does this "text" body actually contain HTML markup (INBOX-R09)?
 * Used by the reading pane to route a mis-typed `text/plain` part that is really
 * HTML through the sanitizer instead of showing raw tags. Conservative — it needs
 * a recognizable tag or closing tag, so prose like "a < b and c > d" is NOT
 * misread as HTML.
 */
export function looksLikeHtml(s: string): boolean {
  return !!s && HTML_MARKUP.test(s);
}
