"use client";

/**
 * Attachment strip for a message (INBOX-R04, metadata half). Lists real
 * attachments (filename + size); inline/cid images are body decoration, not
 * downloads, so they're omitted. No download yet — the bytes half needs a blob
 * store (see OCEANS-DISPOSITION); the title says so.
 */

import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/inbox/attachment-meta";

interface Att {
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
}

export function AttachmentStrip({ attachments }: { attachments?: Att[] }) {
  const files = (attachments ?? []).filter((a) => !a.inline);
  if (files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {files.map((a, i) => (
        <span
          key={`${a.filename}-${i}`}
          title="Download isn't available yet"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
        >
          <Paperclip size={11} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
          <span className="max-w-[180px] truncate">{a.filename}</span>
          {a.size > 0 && (
            <span style={{ color: "var(--color-text-muted)" }}>· {formatBytes(a.size)}</span>
          )}
        </span>
      ))}
    </div>
  );
}
