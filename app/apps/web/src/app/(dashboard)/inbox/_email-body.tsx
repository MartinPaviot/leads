"use client";

import { useMemo, useState } from "react";
import { ImageOff, MoreHorizontal, ShieldAlert } from "lucide-react";
import { sanitizeEmailHtml } from "@/lib/inbox/sanitize-email";
import { applyEmailPrivacy } from "@/lib/inbox/email-privacy";
import { foldQuotedReply } from "@/lib/inbox/email-fold";

/**
 * Renders one email message body with fidelity, privacy and safety (INBOX-R01 +
 * R02/R03/R07).
 *
 * Pipeline: `sanitizeEmailHtml` (security allowlist — drops scripts, neutralises
 * dangerous URLs) → `applyEmailPrivacy` (removes tracking pixels, blocks remote
 * images until the user loads them through our proxy, flags misleading links).
 * Falls back to the text body, preserving line breaks, when there is no HTML.
 *
 * The pane fetches the thread after mount, so this always runs in the browser
 * (real DOMParser, no SSR of untrusted markup). Full dark-mode email theming is
 * INBOX-R08.
 */
const PROXY_BASE = "/api/inbox/image-proxy?url=";

export function EmailBody({ html, text }: { html: string | null; text: string }) {
  const [loadRemote, setLoadRemote] = useState(false);
  const [showTrimmed, setShowTrimmed] = useState(false);

  const safeHtml = useMemo(() => (html ? sanitizeEmailHtml(html) : ""), [html]);
  const privacy = useMemo(
    () => applyEmailPrivacy(safeHtml, { loadRemoteImages: loadRemote, proxyBase: PROXY_BASE }),
    [safeHtml, loadRemote],
  );
  // Split off the quoted reply chain so the new content reads first (R05).
  const fold = useMemo(() => foldQuotedReply(privacy.html), [privacy.html]);

  if (html && safeHtml.trim()) {
    return (
      <div>
        {privacy.suspiciousLinks > 0 && (
          <div
            className="mb-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px]"
            style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
          >
            <ShieldAlert size={13} className="mt-px shrink-0" />
            <span>
              {privacy.suspiciousLinks === 1
                ? "A link's text doesn't match its destination — hover to check before clicking."
                : `${privacy.suspiciousLinks} links' text doesn't match their destination — hover to check before clicking.`}
            </span>
          </div>
        )}

        <div
          className="email-body text-[13px] leading-relaxed"
          // Color is owned by the `.email-body` rule so dark mode can swap to a
          // light "paper" (INBOX-R08); inline color would override that.
          style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
          // Allowlist-sanitized by sanitizeEmailHtml, then privacy-filtered above.
          dangerouslySetInnerHTML={{ __html: fold.visibleHtml }}
        />

        {fold.hasTrimmed && !showTrimmed && (
          <button
            type="button"
            onClick={() => setShowTrimmed(true)}
            title="Show trimmed content"
            aria-label="Show trimmed content"
            className="mt-1 inline-flex items-center rounded px-2 py-0.5 leading-none hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-tertiary)", border: "1px solid var(--color-border-default)" }}
          >
            <MoreHorizontal size={14} />
          </button>
        )}

        {fold.hasTrimmed && showTrimmed && (
          <div
            className="email-body mt-1 border-l pl-2 text-[13px] leading-relaxed"
            style={{
              borderColor: "var(--color-border-default)",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
            dangerouslySetInnerHTML={{ __html: fold.trimmedHtml }}
          />
        )}

        {!loadRemote && privacy.blockedRemoteImages > 0 && (
          <button
            type="button"
            onClick={() => setLoadRemote(true)}
            className="mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <ImageOff size={13} className="shrink-0" />
            <span>
              {privacy.blockedRemoteImages === 1
                ? "1 remote image blocked for your privacy — load it"
                : `${privacy.blockedRemoteImages} remote images blocked for your privacy — load them`}
            </span>
          </button>
        )}
      </div>
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
