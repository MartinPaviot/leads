/**
 * Plain-text linkification for the inbox reading pane's text fallback (INBOX-R09).
 *
 * When a message has no HTML part (or its HTML was unusable), the pane renders
 * the plain text. Plain text has no anchors, so URLs and email addresses arrive
 * as dead strings. This splits the text into segments — runs of plain text
 * interleaved with detected links — which the pane renders as safe `<a>`s
 * (rel=noopener target=_blank, or mailto:). Pure + unit-tested.
 *
 * Deliberately conservative: only http/https URLs, bare `www.` hosts, and email
 * addresses; trailing sentence punctuation is pushed back out of the link.
 */

export type LinkSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

// One pass over URLs (scheme or www.), then email addresses.
const TOKEN_RE =
  /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

function toHref(token: string): string {
  if (token.includes("@") && !/^https?:\/\//i.test(token)) return `mailto:${token}`;
  if (/^www\./i.test(token)) return `https://${token}`;
  return token;
}

export function linkifyPlainText(text: string): LinkSegment[] {
  if (!text) return [];
  const segments: LinkSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    let token = m[0];
    let start = m.index;

    // Strip trailing punctuation (e.g. "see https://x.com." or "(https://x.com)")
    // back into the following plain-text run so links stay clean.
    let trailing = "";
    const trail = TRAILING_PUNCT.exec(token);
    if (trail) {
      trailing = trail[0];
      token = token.slice(0, token.length - trailing.length);
    }
    if (!token) continue; // pure punctuation match — skip

    if (start > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    segments.push({ type: "link", text: token, href: toHref(token) });
    lastIndex = start + token.length;
    if (trailing) {
      segments.push({ type: "text", text: trailing });
      lastIndex += trailing.length;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
}
