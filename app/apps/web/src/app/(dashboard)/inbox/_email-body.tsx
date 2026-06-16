"use client";

import { useMemo } from "react";
import { sanitizeEmailHtml } from "@/lib/inbox/sanitize-email";

/**
 * Renders one email message body with fidelity (INBOX-R01).
 *
 * When the captured message carries an HTML part (`html`), it is sanitized in
 * the browser against a strict allowlist (`sanitizeEmailHtml`) and rendered —
 * so links, images, lists, tables and formatting survive instead of being
 * flattened to plain text. Without an HTML part we fall back to the text body,
 * preserving its line breaks.
 *
 * The pane is a client component that fetches the thread after mount, so this
 * always runs in the browser (real `DOMParser`, no SSR of untrusted markup).
 * Remote-image proxying / tracking-pixel blocking layer on top in R02 / R07;
 * full dark-mode email theming is R08.
 */
export function EmailBody({ html, text }: { html: string | null; text: string }) {
  const safeHtml = useMemo(() => (html ? sanitizeEmailHtml(html) : ""), [html]);

  if (html && safeHtml.trim()) {
    return (
      <div
        className="email-body text-[13px] leading-relaxed"
        style={{
          color: "var(--color-text-primary)",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
        // Content is allowlist-sanitized by sanitizeEmailHtml immediately above.
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <div
      className="whitespace-pre-wrap text-[13px] leading-relaxed"
      style={{ color: "var(--color-text-primary)", wordBreak: "break-word", overflowWrap: "anywhere" }}
    >
      {text}
    </div>
  );
}
