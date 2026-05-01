import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={1} />

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, r) => (
            <div
              key={r}
              className="skeleton-row rounded-lg p-4"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
                minHeight: 100 + (r * 23) % 60,
              }}
            >
              <Skeleton className="h-4 rounded" style={{ width: `${60 + (r * 11) % 30}%` }} />
              <div className="mt-3 space-y-1.5">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 rounded" style={{ width: `${70 + (r * 7) % 25}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="h-2.5 w-16 rounded" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
