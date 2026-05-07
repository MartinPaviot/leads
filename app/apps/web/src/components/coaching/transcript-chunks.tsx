"use client";

import { useEffect, useRef, useState } from "react";
import { Quote } from "lucide-react";
import { formatSecondsAsTimestamp } from "@/lib/coaching/citation-parser";

/**
 * MONACO-PARITY-05 — transcript chunks viewer with `?t=`-driven
 * scroll-to-cite. The coaching citation chips link to
 * `/meetings/<id>?t=<seconds>`; this component reads that and scrolls
 * its DOM ref to the matching chunk, highlighting it briefly so the
 * eye lands on the moment the AI cited.
 *
 * Until a real audio/video player ships, this is the deep-link
 * target — the verbatim transcript text at the cited timestamp,
 * with the speaker labelled. Once a player exists, the same `?t=`
 * value can drive `player.currentTime = seekSeconds` and the user
 * gets both at once.
 */
interface Chunk {
  id: string;
  speaker: string | null;
  startSec: number;
  endSec: number;
  text: string;
  source: string;
}

export function TranscriptChunks({
  meetingId,
  seekSeconds,
}: {
  meetingId: string;
  seekSeconds: number | null;
}) {
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/transcript-chunks`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { chunks: Chunk[]; warning?: string };
        if (cancelled) return;
        setChunks(data.chunks ?? []);
        if (data.warning) setWarning(data.warning);
      } catch (err) {
        if (!cancelled) {
          setChunks([]);
          setWarning(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // Scroll to the chunk that contains seekSeconds whenever either
  // changes (initial load or query-param navigation in-page).
  useEffect(() => {
    if (seekSeconds == null || !chunks?.length || !containerRef.current) return;
    // Find the first chunk whose [start, end] window contains the
    // seek target; fall back to the last chunk that started before
    // the target so a slightly off offset still lands somewhere
    // reasonable.
    let targetChunk = chunks.find(
      (c) => seekSeconds >= c.startSec && seekSeconds <= c.endSec,
    );
    if (!targetChunk) {
      const before = [...chunks].reverse().find((c) => c.startSec <= seekSeconds);
      targetChunk = before ?? chunks[0];
    }
    if (!targetChunk) return;
    const el = containerRef.current.querySelector<HTMLDivElement>(
      `[data-chunk-id="${targetChunk.id}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [seekSeconds, chunks]);

  if (!chunks) {
    return (
      <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Loading transcript chunks…
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div
        className="rounded-lg p-3 text-[12px]"
        style={{
          background: "var(--color-bg-hover)",
          color: "var(--color-text-tertiary)",
        }}
      >
        No transcript chunks indexed yet.
        {warning && ` (${warning})`} The chunks are produced by the
        post-call processing pipeline once a transcript is available.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg max-h-[480px] overflow-y-auto"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
        {chunks.map((c) => {
          const isHighlighted =
            seekSeconds != null &&
            seekSeconds >= c.startSec &&
            seekSeconds <= c.endSec;
          return (
            <li
              key={c.id}
              data-chunk-id={c.id}
              className="px-3 py-2 transition-colors"
              style={{
                background: isHighlighted
                  ? "var(--color-accent-soft, rgba(99,102,241,0.10))"
                  : "transparent",
              }}
            >
              <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                <Quote size={9} aria-hidden />
                <span className="font-mono tabular-nums">
                  {formatSecondsAsTimestamp(c.startSec)}
                </span>
                {c.speaker && (
                  <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {c.speaker}
                  </span>
                )}
                {c.source !== "unknown" && (
                  <span
                    className="rounded px-1 py-0.5 text-[9px]"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {c.source}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                {c.text}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
