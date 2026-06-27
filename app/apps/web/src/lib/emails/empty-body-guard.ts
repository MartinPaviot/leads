/**
 * Send-time empty-body backstop.
 *
 * The autonomous copy path (lib/copy/personalization/generate-message.ts) flags
 * a message `no-body` when its assembled body is blank — which happens when the
 * tenant has no copy assets loaded (the documented pre-launch blocker). But that
 * flag lives on the in-memory Message; by the time a row reaches `outbound_emails`
 * only `body_html` / `body_text` / `subject` survive, so nothing downstream
 * remembers it was blank. Without a guard here the send worker would transmit a
 * blank email — footer + tracking pixel only — to a real prospect.
 *
 * This is the physical backstop: the worker refuses to send a row whose body has
 * no real content. Pure + unit-tested; the worker fails the row with an
 * actionable reason rather than shipping a blank.
 */

/** Reason string the send worker records when it refuses a blank outbound. */
export const EMPTY_BODY_REASON =
  "Empty message body — refusing to send blank copy (no copy assets configured?).";

/**
 * True when an outbound has no real content: the HTML (tags + entities stripped)
 * AND the plain-text alternative are both blank/whitespace. HTML that is only
 * structural tags (`<p></p>`, `<br/>`, `&nbsp;`) counts as empty — there is
 * nothing for a human to read.
 */
export function isEmptyEmailBody(
  bodyHtml: string | null | undefined,
  bodyText: string | null | undefined,
): boolean {
  const htmlText = (bodyHtml ?? "")
    .replace(/<[^>]*>/g, " ") // strip tags
    .replace(/&nbsp;|&#160;/gi, " ") // common non-breaking space entities
    .replace(/\s+/g, " ")
    .trim();
  const plain = (bodyText ?? "").trim();
  return htmlText.length === 0 && plain.length === 0;
}
