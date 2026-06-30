import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Detail-shaped skeleton for a campaign/sequence detail page. Mirrors the
 * resolved layout — PageHeader (title + status badge + actions) + a
 * Steps/Analytics tab bar + a max-w-3xl content column — so neither the route
 * fallback nor the page's own loading branch collapses to a bare centered
 * spinner that then morphs into the real layout. Used by both loading.tsx and
 * the page's `if (loading)` branch.
 */
export function SequenceDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={2} />

      {/* Steps / Analytics tab bar */}
      <div
        className="flex items-center gap-1 border-b px-6 pt-2"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <Skeleton className="mb-2 h-6 w-16 rounded-md" />
        <Skeleton className="mb-2 h-6 w-20 rounded-md" />
      </div>

      {/* Content (max-w-3xl) */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-3 w-40 rounded" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
