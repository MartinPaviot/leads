/**
 * Empty-body backstop. A message is sendable only if it has a non-whitespace
 * text OR html body. The copy engine can assemble an empty body when no copy
 * assets exist (copy_asset_block empty platform-wide — see
 * _research/copy-quality-eval-2026-06-26.md); this is the last line of defense
 * so a blank message is never put on the wire, even if the quality gate is
 * bypassed. Pure + unit-tested; reusable across send transports.
 */
export function isSendableBody(text?: string | null, html?: string | null): boolean {
  if ((text ?? "").trim().length > 0) return true;
  // Strip tags + entities so a tag-only html ("<div></div>", "<br>", "&nbsp;")
  // does not count as real content.
  const htmlText = (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return htmlText.length > 0;
}
