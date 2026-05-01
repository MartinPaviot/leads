import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function DeliverabilityLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle />

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="mt-2 h-6 w-16 rounded" />
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>

        <div
          className="skeleton-row mt-6 rounded-lg p-5"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="mt-4 h-40 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
