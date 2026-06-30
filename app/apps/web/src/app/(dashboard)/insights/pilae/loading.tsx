import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Route fallback for /insights/pilae — mirrors the page's OWN first-paint
// skeleton (its `!data && loading` branch: a `flex-1 overflow-y-auto p-6` body
// holding a `lg:grid-cols-3` grid of three PanelSkeleton cards) over a
// subtitled header. Without this file the segment-level insights/loading.tsx
// (a 3-block vertical stack) was the fallback and morphed into this grid on
// mount. Server component; tokens only.
export default function PilaeLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <PanelSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <Skeleton className="h-2.5 w-28 rounded" />
      <Skeleton className="mt-3 h-7 w-24 rounded" />
      <Skeleton className="mt-2 h-2.5 w-36 rounded" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2.5 w-full rounded" />
        <Skeleton className="h-2.5 w-5/6 rounded" />
        <Skeleton className="h-2.5 w-2/3 rounded" />
      </div>
    </div>
  );
}
