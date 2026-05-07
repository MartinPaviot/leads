"use client";

/**
 * TranscriptVideoPlayer — embedded player for meeting recordings
 * (P0-4 task 4.4).
 *
 * Renders the right embed shape per provider :
 *   - loom / recall / youtube / vimeo → <iframe>
 *   - direct mp4/webm → native <video controls>
 *   - zoom / unknown → "Open in new tab" fallback (provider blocks
 *     framing or we don't know how to embed safely).
 *
 * The component is provider-agnostic — it consumes the
 * `buildEmbedUrl` helper and renders accordingly. New providers are
 * a one-line addition to the helper + a render-shape branch here.
 *
 * Seek-to-time : when the URL itself encodes the seek (loom embed,
 * youtube ?start, vimeo fragment, native #t), the iframe loads at
 * the right offset on mount. For the native <video> case we also
 * imperatively call .currentTime in a useEffect so re-renders with
 * a different seekToSec re-seek without remounting the element.
 */

import { useEffect, useMemo, useRef } from "react";
import { ExternalLink, PlayCircle, AlertTriangle } from "lucide-react";
import { buildEmbedUrl } from "@/lib/coaching/video-player-url";
import { formatSecondsAsTimestamp } from "@/lib/coaching/citation-parser";

interface TranscriptVideoPlayerProps {
  /** Recording URL — pulled from the meeting / activity row. May be
   *  null when no bot was attached or recording isn't ready yet. */
  recordingUrl: string | null | undefined;
  /** Seek to this many seconds on mount. Updated when the user
   *  clicks a different citation chip. */
  seekToSec: number;
  /** Optional className passed to the wrapper. */
  className?: string;
  /** Optional explicit aspect ratio. Default 16:9. */
  aspectRatio?: number;
}

export function TranscriptVideoPlayer({
  recordingUrl,
  seekToSec,
  className = "",
  aspectRatio = 16 / 9,
}: TranscriptVideoPlayerProps) {
  const descriptor = useMemo(
    () => buildEmbedUrl(recordingUrl, seekToSec),
    [recordingUrl, seekToSec],
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Native <video> imperative seek when seekToSec changes ; iframe
  // providers are re-rendered with a new src so the URL change is
  // enough to seek.
  useEffect(() => {
    if (descriptor.provider !== "direct") return;
    const el = videoRef.current;
    if (!el) return;
    const target = Math.max(0, Math.floor(seekToSec));
    if (Math.abs(el.currentTime - target) > 0.5) {
      try {
        el.currentTime = target;
      } catch {
        // ignored — seek before metadata loaded ; the URL fragment
        // covers the initial-mount case.
      }
    }
  }, [descriptor.provider, seekToSec]);

  if (!recordingUrl) {
    return (
      <NoRecordingFallback seekToSec={seekToSec} className={className} />
    );
  }

  if (descriptor.provider === "unknown") {
    return (
      <UnknownProviderFallback
        url={recordingUrl}
        className={className}
      />
    );
  }

  if (descriptor.provider === "zoom") {
    return (
      <ExternalLinkFallback
        url={descriptor.embedUrl}
        provider="Zoom"
        seekToSec={seekToSec}
        className={className}
      />
    );
  }

  if (descriptor.provider === "direct") {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-lg ${className}`}
        style={{
          aspectRatio,
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <video
          ref={videoRef}
          src={descriptor.embedUrl}
          controls
          preload="metadata"
          className="h-full w-full"
        />
      </div>
    );
  }

  // iframe-embeddable providers : loom, recall, youtube, vimeo.
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg ${className}`}
      style={{
        aspectRatio,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <iframe
        // The src includes the seek-to-time so re-renders with a new
        // seekToSec produce a fresh iframe load. Loom / YouTube /
        // Vimeo all respect this.
        key={descriptor.embedUrl}
        src={descriptor.embedUrl}
        title="Meeting recording"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}

function NoRecordingFallback({
  seekToSec,
  className,
}: {
  seekToSec: number;
  className: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg p-6 text-center ${className}`}
      style={{
        background: "var(--color-bg-card)",
        border: "1px dashed var(--color-border-default)",
        color: "var(--color-text-tertiary)",
      }}
    >
      <PlayCircle size={28} aria-hidden />
      <div>
        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
          No recording available
        </p>
        <p className="mt-0.5 text-[11px]">
          Citation at {formatSecondsAsTimestamp(seekToSec)} — viewable in
          transcript chunks below.
        </p>
      </div>
    </div>
  );
}

function ExternalLinkFallback({
  url,
  provider,
  seekToSec,
  className,
}: {
  url: string;
  provider: string;
  seekToSec: number;
  className: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg p-4 ${className}`}
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="min-w-0">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {provider} recording
        </p>
        <p
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {provider} blocks inline embedding. Open in a new tab to start
          at {formatSecondsAsTimestamp(seekToSec)}.
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium"
        style={{
          background: "var(--color-accent)",
          color: "white",
        }}
      >
        Open <ExternalLink size={11} aria-hidden />
      </a>
    </div>
  );
}

function UnknownProviderFallback({
  url,
  className,
}: {
  url: string;
  className: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg p-4 ${className}`}
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-warning, #d97706)",
        color: "var(--color-warning, #d97706)",
      }}
    >
      <AlertTriangle size={16} aria-hidden className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p
          className="text-[12px] font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Unrecognised recording host
        </p>
        <p
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          We can&apos;t embed this URL inline ;{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            open it in a new tab
          </a>
          . Tell us about the host so we can add embed support.
        </p>
      </div>
    </div>
  );
}
