import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

const CARD_STYLE = {
  background: "var(--color-bg-card)",
  border: "1px solid var(--color-border-default)",
} as const;

// Tall pipeline-intelligence panel (RevenueForecast / CohortInsights): icon tile
// + title/subtitle + a badge, a headline number/summary, a diagnosis block, and
// a two-column rate list — the resolved shape these cards settle into.
function PanelSkeleton() {
  return (
    <div className="skeleton-row rounded-lg p-4" style={CARD_STYLE}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="h-2.5 w-24 rounded" />
          </div>
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      {/* Headline + caption */}
      <div className="mt-4 flex items-end gap-3">
        <Skeleton className="h-7 w-28 rounded" />
        <Skeleton className="h-3 w-40 rounded" />
      </div>
      <Skeleton className="mt-2 h-3 w-3/4 rounded" />

      {/* Diagnosis block */}
      <div className="mt-4 rounded-lg p-3" style={{ background: "var(--color-bg-page)" }}>
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="mt-2 h-3 w-full rounded" />
        <Skeleton className="mt-1.5 h-3 w-5/6 rounded" />
      </div>

      {/* Rate list */}
      <Skeleton className="mt-4 h-2.5 w-24 rounded" />
      <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 rounded" style={{ width: `${52 + (i * 11) % 28}%` }} />
            <Skeleton className="h-3 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// On-demand report-type card: icon tile + badge, title, two description lines,
// and a button row (Generate + Schedule weekly).
function TypeCardSkeleton() {
  return (
    <div className="skeleton-row rounded-lg p-4" style={CARD_STYLE}>
      <div className="flex items-start justify-between">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-32 rounded" />
      <Skeleton className="mt-2 h-3 w-full rounded" />
      <Skeleton className="mt-1.5 h-3 w-5/6 rounded" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
    </div>
  );
}

export default function ReportsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Always-on pipeline intelligence — two tall panels */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>

        {/* "Generate a report" section heading */}
        <Skeleton className="mt-8 mb-3 h-3 w-32 rounded" />

        {/* On-demand report-type cards — exactly 3 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <TypeCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
