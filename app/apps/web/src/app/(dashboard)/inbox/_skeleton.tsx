"use client";

/**
 * F3 shared skeletons — each has the SAME footprint as the component it stands in
 * for, so swapping the skeleton out for real data causes zero reflow (no CLS).
 * Skeleton primitive + F1 tokens only (no raw color literal). The `skeleton-row`
 * class re-triggers the existing staggered fade-in + reduced-motion guard in
 * globals.css, so F3 adds no new keyframes.
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Row placeholder — mirrors _inbox-row.tsx (28px avatar + stacked lines, row height). */
export function InboxRowSkeleton() {
  return (
    <div
      className="skeleton-row flex gap-2.5 border-b px-3.5 py-2.5"
      style={{ minHeight: "var(--inbox-row-height)", borderColor: "var(--color-border-default)" }}
    >
      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-3.5 w-32 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

/** `count` row placeholders for the master list while a foreground load runs. */
export function InboxListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: count }, (_, i) => (
        <InboxRowSkeleton key={i} />
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
