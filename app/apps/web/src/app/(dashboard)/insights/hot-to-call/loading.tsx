import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Route fallback for /insights/hot-to-call — mirrors the page's OWN first-paint
// skeleton (its `loading && items.length === 0` branch) so the screen doesn't
// morph when the client page mounts: a subtitled header over a
// `flex-1 overflow-y-auto p-6` body holding the window-chip toolbar + meta row,
// then a `space-y-2` list of three HotCardSkeleton. Without this file the
// segment-level insights/loading.tsx (a 3-block vertical stack) was the
// fallback. Server component; tokens only.
export default function HotToCallLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32 rounded" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <HotCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HotCardSkeleton() {
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
          <Skeleton className="h-3.5 w-40 rounded" />
          <Skeleton className="mt-1.5 h-2.5 w-56 rounded" />
          <Skeleton className="mt-2.5 h-3 w-48 rounded" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
      </div>
    </div>
  );
}
