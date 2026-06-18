/**
 * Inbound attachment metadata (INBOX-R04, metadata half). Captures the
 * filename / type / size / inline-ness of an email's attachments at sync time
 * so the reading pane can list them — mirrors the .ics/calendar plumbing
 * (R12). Pure + unit-tested; transport-specific walks below.
 *
 * Bytes (download/preview) are the OTHER half and stay flagged: @vercel/blob is
 * not installed and capture runs in an Inngest step that JSON-round-trips its
 * result, so multi-MB binary can't cross that boundary — see OCEANS-DISPOSITION.
 */

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  /** Embedded/inline (cid:) — an image in the body, not a download. */
  inline: boolean;
}

const MAX = 20;

function clean(a: Partial<AttachmentMeta>): AttachmentMeta | null {
  const filename = (a.filename || "").trim();
  if (!filename) return null;
  const size = typeof a.size === "number" && Number.isFinite(a.size) ? Math.max(0, Math.floor(a.size)) : 0;
  return {
    filename: filename.slice(0, 200),
    contentType: (a.contentType || "application/octet-stream").toLowerCase(),
    size,
    inline: Boolean(a.inline),
  };
}

/** Gmail payload (googleapis MessagePart tree) → attachment metas. Recursive. */
export function attachmentsFromGmailPayload(payload: unknown): AttachmentMeta[] {
  const out: AttachmentMeta[] = [];
  const walk = (p: any) => {
    if (!p || out.length >= MAX) return;
    const filename = (p.filename || "").trim();
    if (filename && p.body?.attachmentId) {
      const headers: any[] = Array.isArray(p.headers) ? p.headers : [];
      const cd = headers.find((h) => (h.name || "").toLowerCase() === "content-disposition")?.value || "";
      const hasCid = headers.some((h) => (h.name || "").toLowerCase() === "content-id");
      const meta = clean({
        filename,
        contentType: p.mimeType || "",
        size: p.body?.size ?? 0,
        inline: /inline/i.test(cd) || hasCid,
      });
      if (meta) out.push(meta);
    }
    if (Array.isArray(p.parts)) for (const child of p.parts) walk(child);
  };
  walk(payload);
  return out;
}

interface ImapAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  contentDisposition?: string;
  cid?: string;
  related?: boolean;
}

/** mailparser `parsed.attachments` → attachment metas. */
export function attachmentsFromImap(parsed: ImapAttachment[] | undefined): AttachmentMeta[] {
  if (!Array.isArray(parsed)) return [];
  const out: AttachmentMeta[] = [];
  for (const a of parsed) {
    if (out.length >= MAX) break;
    const meta = clean({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      inline: a.contentDisposition === "inline" || Boolean(a.related) || Boolean(a.cid),
    });
    if (meta) out.push(meta);
  }
  return out;
}

/** Coerce stored JSON back into a clean AttachmentMeta[] (read side). */
export function normalizeAttachments(raw: unknown): AttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: AttachmentMeta[] = [];
  for (const a of raw) {
    const meta = clean(a as Partial<AttachmentMeta>);
    if (meta) out.push(meta);
    if (out.length >= MAX) break;
  }
  return out;
}

/** Human-readable size, e.g. "2.4 MB". */
export function formatBytes(n: number): string {
  if (n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
