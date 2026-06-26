"use client";

/**
 * F3 shared skeletons — each has the SAME footprint as the component it stands in
 * for, so swapping the skeleton out for real data causes zero reflow (no CLS).
 * Skeleton primitive + F1 tokens only (no raw color literal). The `skeleton-row`
 * class re-triggers the existing staggered fade-in + reduced-motion guard in
 * globals.css, so F3 adds no new keyframes.
 */

import { Skeleton } from "@/components/ui/skeleton";
import type { InboxDensity } from "./_inbox-row";

/** Row placeholder — mirrors _inbox-row.tsx for the active density so the list
 *  doesn't reflow when real data lands (comfortable = avatar + 2 lines; compact =
 *  small avatar + one line). */
export function InboxRowSkeleton({ density = "comfortable" }: { density?: InboxDensity }) {
  const compact = density === "compact";
  return (
    <div
      className="skeleton-row flex items-center gap-2 border-b px-3"
      style={{
        minHeight: compact ? "var(--inbox-row-height-compact)" : "var(--inbox-row-height)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Reserve the row's leading controls (checkbox 16 · star 14 · unread-dot 8,
          same gap-2/px-3 as InboxRow) so the avatar + text line up exactly when
          real rows replace the skeleton — no horizontal jump on load. */}
      <span className="h-4 w-4 shrink-0" aria-hidden />
      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="h-2 w-2 shrink-0" aria-hidden />
      <Skeleton className={`${compact ? "h-5 w-5" : "h-8 w-8"} shrink-0 rounded-full`} />
      {compact ? (
        <Skeleton className="h-3.5 flex-1 rounded" />
      ) : (
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="h-3 w-10 rounded" />
          </div>
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      )}
    </div>
  );
}

/** `count` row placeholders for the master list while a foreground load runs. */
export function InboxListSkeleton({ count = 8, density = "comfortable" }: { count?: number; density?: InboxDensity }) {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: count }, (_, i) => (
        <InboxRowSkeleton key={i} density={density} />
      ))}
    </div>
  );
}

/** Split-strip placeholder — reserves the strip's height so it never shifts the list. */
export function SplitStripSkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2" aria-hidden="true">
      {[64, 80, 56, 72].map((w, i) => (
        <Skeleton key={i} className="h-6 rounded-full" style={{ width: w }} />
      ))}
    </div>
  );
}

/** Rail placeholder — fixed 212px width matching _mailbox-rail.tsx, so no horizontal jump. */
export function RailSkeleton() {
  return (
    <div
      className="flex w-[212px] shrink-0 flex-col gap-1 border-r py-2"
      style={{ borderColor: "var(--color-border-default)" }}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}
