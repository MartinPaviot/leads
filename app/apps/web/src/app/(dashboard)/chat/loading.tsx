import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="skeleton-row">
          <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
        </div>
        <div className="skeleton-row mt-6 text-center">
          <Skeleton className="mx-auto h-5 w-48 rounded" />
          <Skeleton className="mx-auto mt-2 h-3.5 w-64 rounded" />
        </div>
        <div className="skeleton-row mt-6 flex flex-wrap justify-center gap-2">
          {[140, 160, 120, 180].map((w, i) => (
            <Skeleton key={i} className="rounded-full" style={{ height: 32, width: w }} />
          ))}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-4">
        <div
          className="skeleton-row mx-auto flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            maxWidth: 680,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 flex-1 rounded" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
