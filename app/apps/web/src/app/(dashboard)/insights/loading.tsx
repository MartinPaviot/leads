import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function InsightsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, r) => (
          <div
            key={r}
            className="skeleton-row rounded-lg p-4"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3.5 rounded" style={{ width: `${180 + (r * 17) % 100}px` }} />
                <Skeleton className="mt-2 h-3 w-full rounded" />
                <Skeleton className="mt-1.5 h-3 rounded" style={{ width: `${60 + (r * 11) % 30}%` }} />
                <Skeleton className="mt-2 h-3 w-36 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
