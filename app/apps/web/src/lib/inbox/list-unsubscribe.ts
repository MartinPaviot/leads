/**
 * Parse the RFC 2369 `List-Unsubscribe` + RFC 8058 `List-Unsubscribe-Post`
 * headers into actionable unsubscribe targets (INBOX-T07).
 *
 * `classifyInboundSender` already DETECTS these headers for bulk classification;
 * this extracts the actual endpoint so the inbox unsubscribe action has it
 * without re-fetching. Pure + unit-tested. The one-click POST, suppression-ledger
 * write, and UI are the wiring on top (residual).
 */

export interface UnsubscribeTargets {
  /** Any machine-actionable unsubscribe path exists. */
  available: boolean;
  /** RFC 8058 one-click POST supported (List-Unsubscribe-Post + an http endpoint). */
  oneClick: boolean;
  /** First http(s) unsubscribe endpoint, if any. */
  httpUrl: string | null;
  /** First `mailto:` unsubscribe target, if any. */
  mailto: string | null;
}

const EMPTY: UnsubscribeTargets = { available: false, oneClick: false, httpUrl: null, mailto: null };

export function parseListUnsubscribe(
  headers: Record<string, string> | null | undefined,
): UnsubscribeTargets {
  const lu = headers?.["list-unsubscribe"] ?? "";
  const lup = headers?.["list-unsubscribe-post"] ?? "";
  if (!lu) return EMPTY;

  // Entries are angle-bracketed: "<https://…>, <mailto:…?subject=unsubscribe>".
  let candidates = [...lu.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  // Tolerate non-conformant headers that omit the brackets.
  if (candidates.length === 0) candidates = lu.split(",").map((x) => x.trim());

  let httpUrl: string | null = null;
  let mailto: string | null = null;
  for (const c of candidates) {
    if (/^https?:\/\//i.test(c)) {
      if (!httpUrl) httpUrl = c;
    } else if (/^mailto:/i.test(c)) {
      if (!mailto) mailto = c;
    }
  }

  // One-click requires both the POST opt-in header AND an http endpoint to POST to.
  const oneClick = /one-click/i.test(lup) && !!httpUrl;
  return { available: !!(httpUrl || mailto), oneClick, httpUrl, mailto };
}
