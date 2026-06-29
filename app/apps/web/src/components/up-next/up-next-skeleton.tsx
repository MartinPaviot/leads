import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the "Up next" briefing. Mirrors <UpNextView/>'s resolved
 * layout exactly — a single greeting line, the 6-card KPI grid, and the
 * Activity / Needs-you two-column split — so the whole load path is one
 * continuous shape:
 *
 *   route fallback (home/loading.tsx) -> client-fetch loading branch (UpNextView)
 *   -> real content
 *
 * Nothing morphs and nothing collapses to a bare spinner. Shared by both
 * home/loading.tsx and up-next-view.tsx; pure markup, no client hooks.
 */
export function UpNextSkeleton() {
  return (
    <div className="mx-auto max-w-[1120px]">
      {/* Greeting — the real greeting is a lone <h1> (no subtitle). */}
      <Skeleton className="h-6 w-56 rounded" />

      {/* KPI strip — 6 cards, matching up-next-view.tsx (grid lg:grid-cols-6). */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-3.5"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <Skeleton className="h-2.5 w-14 rounded" />
            <Skeleton className="mt-2 h-5 w-12 rounded" />
            <Skeleton className="mt-1.5 h-2 w-10 rounded" />
          </div>
        ))}
      </div>

      {/* Two columns — Activity (wide) + Needs you, matching up-next-view.tsx. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Activity */}
        <section className="lg:col-span-3">
          <Skeleton className="h-3 w-20 rounded" />
          <div
            className="mt-2.5 overflow-hidden rounded-xl"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3.5 py-2.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-border-default)" }}
              >
                <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 rounded" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
                  <Skeleton className="mt-1.5 h-2.5 rounded" style={{ width: `${30 + ((i * 17) % 25)}%` }} />
                </div>
                <Skeleton className="h-2.5 w-8 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Needs you */}
        <section className="lg:col-span-2">
          <Skeleton className="h-3 w-24 rounded" />
          <div className="mt-2.5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl p-3"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-default)",
                  borderLeft: "3px solid var(--color-border-default)",
                }}
              >
                <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="mt-1.5 h-2.5 w-1/2 rounded" />
                </div>
                <Skeleton className="h-6 w-14 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
