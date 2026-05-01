import { HeaderSkeleton, FilterBarSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={1} />
      <FilterBarSkeleton tabs={4} />

      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 10 }).map((_, r) => (
          <div
            key={r}
            className="skeleton-row flex items-center gap-3 px-6"
            style={{ height: 52, borderBottom: "1px solid var(--color-border-default)" }}
          >
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex-1">
              <Skeleton className="h-3.5 rounded" style={{ width: `${150 + (r * 17) % 120}px` }} />
              {r % 2 === 0 && <Skeleton className="mt-1 h-2.5 w-20 rounded" />}
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-12 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
