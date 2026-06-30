import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Route fallback for /insights/playbook — mirrors the page's OWN first-paint
// skeleton (its `listState === "initial-loading"` branch) so the screen doesn't
// morph when the client page mounts: a subtitled header over a
// `flex-1 overflow-y-auto p-6` body holding the filter-chip + Add-entry toolbar
// (All + the 3 PLAYBOOK_ENTRY_TYPES = 4 chips), then a `space-y-2` list of
// three EntryCardSkeleton. Without this file the segment-level
// insights/loading.tsx (a 3-block vertical stack) was the fallback. Server
// component; tokens only.
export default function PlaybookLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-6 w-24 rounded" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <EntryCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryCardSkeleton() {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="mt-2.5 h-3 w-full rounded" />
          <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
        </div>
        <Skeleton className="h-3 w-10 rounded" />
      </div>
    </div>
  );
}
