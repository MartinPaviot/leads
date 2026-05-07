"use client";

import Link from "next/link";
import { Quote } from "lucide-react";
import type { CitationToken } from "@/lib/coaching/citation-parser";

/**
 * Renders a single `[mm:ss]` citation as a clickable chip that links
 * to the meeting recording at the cited offset.
 *
 * MONACO-PARITY-05 — the visible payoff of the RAG pipeline. Every
 * coaching answer that quotes a transcript shows one of these next to
 * the verbatim quote; clicking jumps the user to the exact moment in
 * the recording. The meeting page reads `?t=` from the URL and seeks
 * the player on mount.
 *
 * `meetingId` is optional because some coaching answers cite content
 * across multiple meetings; the renderer in those cases passes the
 * meeting id derived from the closest preceding "From <meeting>:"
 * section header. When meetingId is null we render a non-clickable
 * style so the user knows the chip isn't navigable yet.
 */
export function CitationChip({
  token,
  meetingId,
}: {
  token: CitationToken;
  meetingId?: string | null;
}) {
  const label = token.display;
  if (!meetingId) {
    return (
      <span
        title="Citation timestamp"
        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums"
        style={{
          background: "var(--color-bg-hover)",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <Quote size={9} aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <Link
      href={`/meetings/${meetingId}?t=${token.seconds}`}
      title={`Open recording at ${label}`}
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums no-underline transition-colors"
      style={{
        background: "var(--color-accent-soft, rgba(99,102,241,0.10))",
        color: "var(--color-accent, #6366f1)",
        border: "1px solid rgba(99,102,241,0.25)",
      }}
    >
      <Quote size={9} aria-hidden />
      {label}
    </Link>
  );
}
