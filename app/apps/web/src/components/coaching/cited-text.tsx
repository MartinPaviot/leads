"use client";

import React from "react";
import { splitWithCitations } from "@/lib/coaching/citation-parser";
import { CitationChip } from "./citation-chip";

/**
 * Render a string that may contain `[mm:ss]` citation markers,
 * splicing in `<CitationChip>` at each marker and leaving plain text
 * unchanged. Use this for any coaching response surface — the chat
 * page, deal briefings, account summaries — wherever the LLM is
 * instructed to cite transcripts.
 *
 * `meetingId` is the canonical meeting whose recording the chips
 * point to. When the answer spans multiple meetings, the upstream
 * renderer is expected to call this once per section with the
 * appropriate meetingId. Passing null disables linking but still
 * shows the timestamp.
 */
export function CitedText({
  text,
  meetingId,
}: {
  text: string;
  meetingId?: string | null;
}) {
  if (!text) return null;
  const segments = splitWithCitations(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          // Preserve newlines by mapping to <br/> for inline rendering.
          // For prose blocks, callers should pre-split into paragraphs.
          if (!seg.text.includes("\n")) {
            return <React.Fragment key={i}>{seg.text}</React.Fragment>;
          }
          const lines = seg.text.split("\n");
          return (
            <React.Fragment key={i}>
              {lines.map((ln, j) => (
                <React.Fragment key={j}>
                  {ln}
                  {j < lines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        return (
          <CitationChip key={i} token={seg.token} meetingId={meetingId ?? null} />
        );
      })}
    </>
  );
}
