"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageOff, MoreHorizontal, ShieldAlert, ShieldCheck } from "lucide-react";
import { sanitizeEmailHtml, looksLikeHtml } from "@/lib/inbox/sanitize-email";
import { applyEmailPrivacy } from "@/lib/inbox/email-privacy";
import { foldQuotedReply, foldPlainTextReply } from "@/lib/inbox/email-fold";
import { linkifyPlainText } from "@/lib/inbox/linkify";
import { classifyLink, riskChipLabel } from "@/lib/inbox/link-safety";
import { isImageSenderTrusted } from "@/lib/inbox/image-trust";
import { dirOf } from "@/lib/inbox/text-direction";

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

export function EmailBody({
  html,
  text,
  senderEmail,
  trustedSenders,
  onTrust,
}: {
  html: string | null;
  text: string;
  /** Sender address for the "always show images from this sender" memory (R02). */
  senderEmail?: string;
  /** The user's trusted-image-sender allowlist; a match auto-loads remote images. */
  trustedSenders?: string[];
  /** Called when the user trusts this sender, so the pane can update its list. */
  onTrust?: (email: string) => void;
}) {
  const trusted = isImageSenderTrusted(trustedSenders ?? [], senderEmail ?? "");
  // Load remote images by default (through our IP-hiding proxy, like Gmail), so
  // HTML mail renders with its images instead of empty boxes + a "blocked" prompt.
  // `trusted` is now redundant for the default but kept for the per-sender memory.
  const [loadRemote, setLoadRemote] = useState(true);
  const [showTrimmed, setShowTrimmed] = useState(false);

  // A trusted sender's images auto-load — the allowlist may arrive after mount (R02).
  useEffect(() => {
    if (trusted) setLoadRemote(true);
  }, [trusted]);

  function trustSender() {
    if (!senderEmail) return;
    void fetch("/api/inbox/image-trust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: senderEmail }),
    }).catch(() => {});
    onTrust?.(senderEmail);
    setLoadRemote(true);
  }

  // Prefer the real HTML part; if it is absent but the "text" body actually
  // contains markup (mis-typed text/plain part), route that through the
  // sanitizer too instead of showing raw tags (INBOX-R09).
  const htmlSource = html ?? (looksLikeHtml(text) ? text : null);
  const safeHtml = useMemo(() => {
    if (!htmlSource) return "";
    try {
      return sanitizeEmailHtml(htmlSource);
    } catch {
      // Sanitizer failure must never blank or crash the pane — fall back to the
      // text path below (INBOX-R09).
      return "";
    }
  }, [htmlSource]);
  const privacy = useMemo(
    () => applyEmailPrivacy(safeHtml, { loadRemoteImages: loadRemote, proxyBase: PROXY_BASE }),
    [safeHtml, loadRemote],
  );
  // Split off the quoted reply chain so the new content reads first (R05).
  const fold = useMemo(() => foldQuotedReply(privacy.html), [privacy.html]);

  if (htmlSource && safeHtml.trim()) {
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
          dir="auto" // per-element RTL/LTR from the content (INBOX-R10)
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
            dir="auto"
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

        {!loadRemote && privacy.blockedRemoteImages > 0 && senderEmail && (
          <button
            type="button"
            onClick={trustSender}
            title="Always load images from this sender, on every message"
            className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <ShieldCheck size={13} className="shrink-0" />
            <span>Always show from this sender</span>
          </button>
        )}
      </div>
    );
  }

  // Inbound mail synced without an HTML part arrives as a degraded text body —
  // [IMG:alt]/[LINK:url] markers from the html→text step + runaway blank lines.
  // Strip the markers (there is no URL behind an [IMG:] to render) and collapse
  // the gaps so it reads cleanly instead of as a wall of placeholders with
  // monstrous spacing (the reported "écart monstrueux").
  const cleanText = text
    // The html→text step wraps lines, so the marker can be "[\nIMG: alt ]" /
    // "[\nLINK: url ]" — tolerate any whitespace after "[" and around the value.
    .replace(/\[\s*IMG:[^\]]*\]/gi, "")
    .replace(/\[\s*LINK:\s*([^\]]+?)\s*\]/gi, " $1 ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Empty body — a clear, distinct state (not a load error), per INBOX-R09.
  if (!cleanText.trim()) {
    return (
      <div className="text-[13px] italic leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
        (no content)
      </div>
    );
  }

  // Linkify + per-link safety (R03), shared by the visible body and the folded tail.
  const renderText = (t: string) =>
    linkifyPlainText(t).map((seg, i) => {
      if (seg.type !== "link") return <span key={i}>{seg.text}</span>;
      const safety = classifyLink(seg.href, seg.text);
      const chip = riskChipLabel(safety);
      return (
        <span key={i}>
          <a
            href={safety.safeHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={
              safety.realHost
                ? safety.risky && safety.reason
                  ? safety.reason
                  : `Goes to ${safety.realHost}`
                : undefined
            }
            style={{ color: "var(--color-accent)", textDecoration: "underline" }}
          >
            {seg.text}
          </a>
          {chip && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 rounded px-1 align-baseline text-[11px]"
              style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
              title={safety.reason ?? undefined}
            >
              <ShieldAlert size={11} className="shrink-0" />
              {chip}
            </span>
          )}
        </span>
      );
    });

  // Fold the quoted reply / signature tail so the new content reads first (R05/R09).
  const textFold = foldPlainTextReply(cleanText);

  return (
    <div
      className="whitespace-pre-wrap text-[13px] leading-relaxed"
      style={{ color: "var(--color-text-primary)", wordBreak: "break-word", overflowWrap: "anywhere" }}
      dir={dirOf(cleanText)}
    >
      {renderText(textFold.visible)}

      {textFold.hasTrimmed && !showTrimmed && (
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

      {textFold.hasTrimmed && showTrimmed && (
        <div className="mt-1 border-l pl-2" style={{ borderColor: "var(--color-border-default)" }}>
          {renderText(textFold.trimmed)}
        </div>
      )}
    </div>
  );
}
