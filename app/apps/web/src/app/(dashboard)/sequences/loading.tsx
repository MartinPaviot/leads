import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function SequencesLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={1} />

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, r) => (
            <div
              key={r}
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 rounded" style={{ width: `${100 + (r * 17) % 60}px` }} />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="mt-3 flex items-center gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-5 w-8 rounded" />
                    <Skeleton className="mt-0.5 h-2.5 w-12 rounded" />
                  </div>
                ))}
              </div>
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-2.5 w-16 rounded" />
                </div>
                <Skeleton className="h-2.5 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
