import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {Array.from({ length: 4 }).map((_, s) => (
            <div
              key={s}
              className="skeleton-row rounded-lg p-5"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-4 rounded" style={{ width: `${100 + s * 30}px` }} />
              <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 2 + (s % 2) }).map((_, f) => (
                  <div key={f}>
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="mt-1.5 h-8 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
