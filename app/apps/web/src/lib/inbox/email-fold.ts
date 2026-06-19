/**
 * Quote / reply-chain folding for the inbox reading pane (INBOX-R05).
 *
 * Splits a rendered email into the NEW content the reader cares about and the
 * trailing quoted thread (the "On <date>, <name> wrote: > …" chain). The pane
 * shows the new content and tucks the quote behind a "show trimmed content"
 * toggle — the single biggest readability win on long threads.
 *
 * Heuristic, cross-client: detects `<blockquote>`, the major clients' quote
 * containers (Gmail/Yahoo/Thunderbird/Outlook), the attribution line that
 * precedes a quote (EN/FR/DE), AND the trailing signature / legal-disclaimer
 * block (the `-- ` RFC 3676 delimiter, `gmail_signature`, "Sent from my …",
 * confidentiality footers) so the reader sees only the new content. Runs on
 * already-sanitized HTML (so classes we key on, like `gmail_quote`, are still
 * present — `class` is allowlisted).
 *
 * DOM-based ⇒ browser only; on the server it is a no-op (everything "visible").
 */

export interface FoldResult {
  visibleHtml: string;
  trimmedHtml: string;
  hasTrimmed: boolean;
}

// "On Mon, 1 Jun 2026 … wrote:", "Le … a écrit :", "Am … schrieb …:",
// "-----Original Message-----". Kept tight (≤200 chars) so a body paragraph that
// merely contains "wrote:" isn't mistaken for the attribution line.
const ATTRIBUTION_RE =
  /(?:^|\n)\s*(?:on\b[\s\S]{0,160}?\bwrote:|le\b[\s\S]{0,160}?\ba écrit\s*:|am\b[\s\S]{0,160}?\bschrieb[\s\S]{0,40}?:|-{2,}\s*original message\s*-{2,}|_{5,})\s*$/i;

const QUOTE_CLASS_RE = /\b(gmail_quote|gmail_extra|yahoo_quoted|moz-cite-prefix|zmail_extra)\b/i;
const QUOTE_ID_RE = /(appendonsend|divrplymessage|x_appendonsend)/i;

function isQuoteBoundary(el: Element): boolean {
  if (el.tagName.toLowerCase() === "blockquote") return true;
  const cls = (el.getAttribute("class") || "").toLowerCase();
  if (QUOTE_CLASS_RE.test(cls)) return true;
  const id = (el.getAttribute("id") || "").toLowerCase();
  if (QUOTE_ID_RE.test(id)) return true;
  if (el.querySelector("blockquote")) return true;
  return false;
}

function isAttributionNode(node: Node): boolean {
  const text = (node.textContent || "").trim();
  if (!text || text.length > 200) return false;
  return ATTRIBUTION_RE.test(text);
}

// Legal / auto footers. Anchored at the start of the block so a body that merely
// mentions "this email" mid-sentence is never mistaken for a disclaimer.
const DISCLAIMER_RE =
  /^(?:confidentiality notice|disclaimer\s*:|this (?:e-?mail|message)(?: and (?:any|its) attachments?)? (?:is|are) (?:intended|confidential|strictly confidential)|this (?:e-?mail|message) is intended (?:only |solely )?for|the (?:information|content)[\s\S]{0,40}?is (?:confidential|intended)|sent from my \w+|please consider the environment)/i;

/** A trailing signature or disclaimer block: the `-- ` delimiter line, a
 *  `gmail_signature`/`#signature` container, "Sent from my …", or a legal footer. */
function isSignatureNode(node: Node): boolean {
  if (node.nodeType === 1) {
    const el = node as Element;
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();
    if (/\bgmail_signature\b/.test(cls) || /\bsignature\b/.test(id)) return true;
  }
  const text = (node.textContent || "").trim();
  if (!text) return false;
  // RFC 3676 "-- " delimiter as the first line of the block.
  if (text.split("\n")[0].trim() === "--") return true;
  return DISCLAIMER_RE.test(text);
}

// Line-oriented attribution for the plain-text path (the HTML one keys on nodes).
const PLAIN_ATTRIBUTION_RE =
  /^\s*(?:on\b.{0,160}?\bwrote:|le\b.{0,160}?\ba écrit\s*:|am\b.{0,160}?\bschrieb.{0,40}?:|-{2,}\s*original message\s*-{2,}|_{5,})\s*$/i;

export interface PlainFoldResult {
  visible: string;
  trimmed: string;
  hasTrimmed: boolean;
}

/**
 * Quote / signature folding for the PLAIN-TEXT reading path (INBOX-R05/R09).
 * Splits at the first `>`-quoted line, attribution line ("On … wrote:"), or
 * `-- ` signature delimiter — the quoted tail always sits at the bottom of a
 * plain-text reply — so the pane shows the new content with the rest one tap away.
 * Pure (string-only); never hides everything (a pure-quote forward stays visible).
 */
export function foldPlainTextReply(text: string): PlainFoldResult {
  if (!text) return { visible: "", trimmed: "", hasTrimmed: false };
  const lines = text.split("\n");
  let foldAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line) || PLAIN_ATTRIBUTION_RE.test(line) || line.trim() === "--") {
      foldAt = i;
      break;
    }
  }
  if (foldAt < 0) return { visible: text, trimmed: "", hasTrimmed: false };
  const visible = lines.slice(0, foldAt).join("\n");
  const trimmed = lines.slice(foldAt).join("\n");
  // Boundary at the very top (pure quote / leading attribution) → show it all.
  if (!visible.trim()) return { visible: text, trimmed: "", hasTrimmed: false };
  return { visible, trimmed, hasTrimmed: trimmed.trim().length > 0 };
}

export function foldQuotedReply(html: string): FoldResult {
  if (!html) return { visibleHtml: "", trimmedHtml: "", hasTrimmed: false };
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { visibleHtml: html, trimmedHtml: "", hasTrimmed: false };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.body.childNodes);

  let foldIndex = -1;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1 && isQuoteBoundary(n as Element)) {
      foldIndex = i;
      break;
    }
    if (isAttributionNode(n)) {
      foldIndex = i;
      break;
    }
    if (isSignatureNode(n)) {
      foldIndex = i;
      break;
    }
  }

  // foldIndex <= 0 → nothing to fold, or the message IS the quote (pure forward):
  // either way show everything rather than hide the whole body.
  if (foldIndex <= 0) {
    return { visibleHtml: doc.body.innerHTML, trimmedHtml: "", hasTrimmed: false };
  }

  const visible = doc.createElement("div");
  const trimmed = doc.createElement("div");
  nodes.forEach((n, i) => (i < foldIndex ? visible : trimmed).appendChild(n));

  // Only fold when something real remains visible (never leave an empty pane).
  if (!(visible.textContent || "").trim()) {
    return { visibleHtml: doc.body.innerHTML, trimmedHtml: "", hasTrimmed: false };
  }

  return {
    visibleHtml: visible.innerHTML,
    trimmedHtml: trimmed.innerHTML,
    hasTrimmed: trimmed.childNodes.length > 0,
  };
}
