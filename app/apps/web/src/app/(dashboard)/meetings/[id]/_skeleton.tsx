import { Skeleton } from "@/components/ui/skeleton";

/**
 * Detail-shaped skeleton for a meeting detail page. Mirrors the resolved layout
 * — a centered `p-6 max-w-4xl` column with a back-button + title, a
 * recording/transcript card, and a notes block — so neither the route fallback
 * nor the page's own loading branch collapses to a bare centered spinner that
 * then morphs into the real layout. Used by both loading.tsx and the page's
 * `if (loading)` branch.
 */
export function MeetingDetailSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back button + title */}
      <div>
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="mt-4 h-6 w-64 rounded" />
        <Skeleton className="mt-1.5 h-3.5 w-40 rounded" />
      </div>

      {/* Recording / transcript card */}
      <Skeleton className="h-40 w-full rounded-lg" />

      {/* Notes block */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-3.5 w-full rounded" />
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="h-3.5 w-2/3 rounded" />
      </div>
    </div>
  );
}
