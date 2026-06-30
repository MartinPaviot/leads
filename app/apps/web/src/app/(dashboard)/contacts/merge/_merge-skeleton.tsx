import { Skeleton } from "@/components/ui/skeleton";

// Footprint skeleton mirroring the loaded GroupCard layout (rounded border
// section + header with title/subtitle/action + candidate rows) so swapping to
// real data causes no reflow. Exported (not from page.tsx, which may export only
// default+config) so BOTH the page's `loading` branch and the route's
// loading.tsx render the exact same skeleton — the nav fallback is then
// pixel-identical to the in-page skeleton (no table-to-cards morph).
export function MergeSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, s) => (
        <section
          key={s}
          className="skeleton-row rounded-lg border"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
        >
          <header className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--color-border-default)" }}>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-48 rounded" />
              <Skeleton className="h-2.5 w-32 rounded" />
            </div>
            <Skeleton className="h-7 w-40 rounded-md" />
          </header>
          <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
            {Array.from({ length: 3 }).map((_, r) => (
              <li key={r} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40 rounded" />
                  <Skeleton className="h-2.5 w-56 rounded" />
                </div>
                <Skeleton className="h-2.5 w-16 rounded" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
