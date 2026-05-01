import { HeaderSkeleton, FilterBarSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />
      <FilterBarSkeleton tabs={4} />

      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 12 }).map((_, r) => (
          <div
            key={r}
            className="skeleton-row flex items-center gap-4 px-6"
            style={{ height: 56, borderBottom: "1px solid var(--color-border-default)" }}
          >
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 rounded" style={{ width: `${70 + (r * 11) % 50}px` }} />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="mt-1 h-3 rounded" style={{ width: `${180 + (r * 17) % 120}px` }} />
            </div>
            <Skeleton className="h-3 w-12 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
