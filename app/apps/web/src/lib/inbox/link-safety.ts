/**
 * Per-link safety classification for the inbox reading pane (INBOX-R03).
 *
 * Pure, deterministic, ZERO-network: every verdict is computed from the URL
 * string and the link's visible text alone. We never fetch or pre-resolve a
 * target — so checking a link's safety never itself leaks a "this address is
 * live" signal to a phisher (no SSRF, no open-redirect probing).
 *
 * This is the richer layer under email-privacy's binary `isSuspiciousLink`
 * (which only needs a yes/no for the body-level banner). `classifyLink` returns
 * the *true* resolved host, the distinct risk reasons, a human explanation, and
 * a DOM-safe href — enough for the pane to preview the real destination on every
 * link (hover/focus) and stamp an inline warning chip on each risky one.
 */

export type LinkRisk =
  | "mismatch" // visible text claims a domain different from the destination
  | "punycode" // internationalized / homograph host (xn--…) — look-alike risk
  | "credentials" // userinfo before "@" hides the real host
  | "ip-literal" // host is a raw IPv4/IPv6 address, not a named site
  | "dangerous-scheme"; // javascript:/vbscript:/non-image data:/unknown scheme

export interface LinkSafety {
  /** Real resolved host, lowercased, trailing dot stripped. null for
   *  schemeless/relative/mailto/tel/data: links (nothing to navigate to). */
  realHost: string | null;
  /** Distinct risk reasons; empty when benign. */
  risks: LinkRisk[];
  /** Convenience flag — `risks.length > 0`. */
  risky: boolean;
  /** Short, human, citable explanation of the top risk, or null when benign. */
  reason: string | null;
  /** A href safe to place in the DOM. Dangerous schemes and app-origin /
   *  relative / anchor links collapse to "#"; safe links pass through. */
  safeHref: string;
}

/** Common multi-part public suffixes, so `bank.co.uk` ≠ `phish.co.uk` instead of
 *  both collapsing to `co.uk`. Not the full PSL (that needs a dependency) — just
 *  the suffixes a phisher is most likely to hide behind. */
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk",
  "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.il",
  "com.au", "net.au", "org.au", "com.br", "com.cn", "com.mx", "com.tr", "com.sg",
]);

const DOMAIN_IN_TEXT = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Registrable-ish domain (PSL-free): the last 2 labels, or 3 when the last 2
 *  form a known multi-part TLD. Used to compare visible-text vs destination. */
export function registrableish(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length >= 3 && MULTI_PART_TLDS.has(labels.slice(-2).join("."))) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

function isIpLiteralHost(host: string): boolean {
  // url.hostname renders IPv6 inside brackets ("[::1]"); IPv4 is dotted-quad.
  return IPV4.test(host) || host.startsWith("[") || host.includes(":");
}

/** Neutralized verdict for relative / anchor / unknown-scheme links: no host,
 *  no warning chip, href collapsed to "#" so it never navigates the app origin. */
function neutralized(): LinkSafety {
  return { realHost: null, risks: [], risky: false, reason: null, safeHref: "#" };
}

function benign(safeHref: string, realHost: string | null): LinkSafety {
  return { realHost, risks: [], risky: false, reason: null, safeHref };
}

function danger(risk: LinkRisk, reason: string): LinkSafety {
  return { realHost: null, risks: [risk], risky: true, reason, safeHref: "#" };
}

// Priority order for the single-sentence `reason` (risks[] still holds all).
const RISK_PRIORITY: LinkRisk[] = ["dangerous-scheme", "credentials", "mismatch", "ip-literal", "punycode"];

function reasonFor(risk: LinkRisk, host: string | null): string {
  switch (risk) {
    case "credentials":
      return 'This link hides login credentials before the "@" — a common phishing trick.';
    case "mismatch":
      return `The visible text doesn't match the real destination${host ? ` (${host})` : ""}.`;
    case "ip-literal":
      return `This link points to a raw IP address${host ? ` (${host})` : ""}, not a named site.`;
    case "punycode":
      return `Internationalized domain${host ? ` (${host})` : ""} — it can imitate a familiar name.`;
    case "dangerous-scheme":
      return "This link uses an unsafe scheme and was disabled.";
  }
}

/**
 * Classify one link from its href + the text the reader sees. Pure.
 */
export function classifyLink(href: string, visibleText = ""): LinkSafety {
  const raw = (href ?? "").trim();
  if (!raw || raw.startsWith("#")) return neutralized();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Relative / protocol-relative / anchor — neutralize (no app-origin nav).
    return neutralized();
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme === "javascript:" || scheme === "vbscript:") {
    return danger("dangerous-scheme", reasonFor("dangerous-scheme", null));
  }
  if (scheme === "data:") {
    // Inline images are harmless; every other data: payload is neutralized.
    if (/^data:image\//i.test(raw)) return benign(raw, null);
    return danger("dangerous-scheme", reasonFor("dangerous-scheme", null));
  }
  // mailto:/tel: are handled by the OS — allowed, no host, no warning.
  if (scheme === "mailto:" || scheme === "tel:") return benign(raw, null);
  // Anything other than http(s) (file:, ftp:, …) has no place in mail — neutralize.
  if (scheme !== "http:" && scheme !== "https:") return neutralized();

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const risks: LinkRisk[] = [];

  if (url.username) risks.push("credentials");
  if (isIpLiteralHost(host)) risks.push("ip-literal");
  if (host.includes("xn--")) risks.push("punycode");

  const m = DOMAIN_IN_TEXT.exec(visibleText || "");
  if (m && registrableish(m[1]) !== registrableish(host)) risks.push("mismatch");

  if (risks.length === 0) return benign(raw, host);

  const top = RISK_PRIORITY.find((r) => risks.includes(r)) ?? risks[0];
  return { realHost: host, risks, risky: true, reason: reasonFor(top, host), safeHref: raw };
}

/**
 * Short label for an inline warning chip rendered next to a risky link, or null
 * when the link is benign. Kept here (out of the DOM walk) so it is unit-tested.
 */
export function riskChipLabel(safety: LinkSafety): string | null {
  if (!safety.risky) return null;
  const top = RISK_PRIORITY.find((r) => safety.risks.includes(r)) ?? safety.risks[0];
  switch (top) {
    case "mismatch":
      return safety.realHost ? `goes to ${safety.realHost}` : "destination mismatch";
    case "ip-literal":
      return safety.realHost ? `raw IP ${safety.realHost}` : "raw IP address";
    case "punycode":
      return "look-alike domain";
    case "credentials":
      return "hidden login";
    case "dangerous-scheme":
      return "disabled link";
  }
}
