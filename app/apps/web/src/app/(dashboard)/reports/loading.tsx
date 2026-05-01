import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />

      <div className="flex-1 overflow-auto p-6">
        <div className="skeleton-row mb-6">
          <Skeleton className="h-5 w-44 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-72 rounded" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, r) => (
            <div
              key={r}
              className="skeleton-row rounded-lg p-5"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 flex-1 rounded" style={{ maxWidth: `${80 + (r * 13) % 40}%` }} />
              </div>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
              <Skeleton className="mt-4 h-8 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
