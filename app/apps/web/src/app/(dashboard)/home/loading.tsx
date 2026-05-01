import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle />

      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Greeting */}
        <div className="skeleton-row">
          <Skeleton className="h-7 w-56 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-40 rounded" />
        </div>

        {/* Weekly summary */}
        <div
          className="skeleton-row mt-4 rounded-lg p-4"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
        >
          <div className="flex items-center gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-5 w-8 rounded" />
                <Skeleton className="h-3 w-14 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Two column */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Actions */}
          <div className="lg:col-span-3">
            <Skeleton className="h-3 w-32 rounded" />
            <div className="mt-3 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="skeleton-row rounded-lg p-4"
                  style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                >
                  <div className="flex items-start gap-2">
                    <Skeleton className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 rounded" style={{ width: `${65 + i * 7}%` }} />
                      <Skeleton className="mt-2 h-3 w-1/2 rounded" />
                    </div>
                    <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <Skeleton className="h-3 w-28 rounded" />
              <div
                className="skeleton-row mt-3 rounded-lg p-4"
                style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
              >
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="mt-2 h-3 w-1/3 rounded" />
              </div>
            </div>
            <div>
              <Skeleton className="h-3 w-24 rounded" />
              <div className="mt-3 space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="skeleton-row flex items-center gap-2 rounded-lg px-3 py-2.5"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                  >
                    <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="mt-1 h-2.5 w-32 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
