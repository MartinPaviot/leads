import { HeaderSkeleton, FilterBarSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function MeetingsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={1} />
      <FilterBarSkeleton tabs={3} search />

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, r) => (
          <div
            key={r}
            className="skeleton-row flex items-start gap-4 rounded-lg p-4"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="shrink-0" style={{ width: 52 }}>
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="mt-1 h-3 w-8 rounded" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 rounded" style={{ width: `${140 + (r * 17) % 80}px` }} />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
            <Skeleton className="h-3 w-10 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
