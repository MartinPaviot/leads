"use client";

import { Mail } from "lucide-react";
import { CopyButton } from "./copy-button";

interface EmailPreviewCardProps {
  to: string;
  subject: string;
  body: string;
  onOpenComposer?: () => void;
}

export function EmailPreviewCard({ to, subject, body, onOpenComposer }: EmailPreviewCardProps) {
  return (
    <div
      className="my-3 rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          background: "var(--color-bg-muted)",
        }}
      >
        <Mail size={13} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          Email Draft
        </span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton text={`Subject: ${subject}\n\n${body}`} />
          {onOpenComposer && (
            <button
              onClick={onOpenComposer}
              className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
              style={{
                color: "var(--color-accent)",
                background: "var(--color-accent-soft)",
              }}
            >
              Open in Composer
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        <div className="flex items-baseline gap-2 text-[13px]">
          <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500, minWidth: 28 }}>To</span>
          <span style={{ color: "var(--color-text-primary)" }}>{to}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[13px] mt-1">
          <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500, minWidth: 28 }}>Subj</span>
          <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{subject}</span>
        </div>
      </div>

      {/* Body */}
      <div
        className="px-4 py-3 text-[13px] leading-[20px] whitespace-pre-wrap"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {body}
      </div>
    </div>
  );
}
