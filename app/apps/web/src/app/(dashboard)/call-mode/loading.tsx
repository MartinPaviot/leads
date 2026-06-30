import { Skeleton, HeaderSkeleton } from "@/components/ui/skeleton";

/**
 * Route-level Suspense fallback for /call-mode (shown during navigation + the
 * JS-chunk load, before the page's own `if (loading)` branch can paint).
 *
 * Call Mode renders inside CallModeShell — a PageHeader (Phone · "Call Mode")
 * over a 3-column cockpit: a left queue rail, a centre brief/funnel, a right
 * script rail. The page's loading branch already paints a bespoke cockpit
 * skeleton at the persisted column widths; this fallback reproduces the SAME
 * footprint so the route-fallback → in-page-skeleton swap is seamless (no
 * reflow, never a bare centered spinner).
 *
 * HeaderSkeleton stands in for the client PageHeader (identical 44px bar) per
 * every sibling loading.tsx. Column widths use the page's pre-localStorage
 * defaults (left 224 / right 480); borders use design tokens rather than the
 * page's zinc utility classes.
 */
export default function CallModeLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <HeaderSkeleton subtitle />

      <div className="flex min-h-0 w-full flex-1" aria-busy="true">
        {/* LEFT — queue rail */}
        <aside
          className="shrink-0 overflow-hidden"
          style={{ width: 224, borderRight: "1px solid var(--color-border-default)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mt-1.5 h-3 w-16 rounded" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-row flex items-start gap-2.5 px-4 py-3"
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
              >
                <Skeleton className="mt-0.5 h-7 w-7 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 rounded" style={{ width: `${60 + ((i * 11) % 30)}%` }} />
                  <Skeleton className="mt-1.5 h-3 rounded" style={{ width: `${40 + ((i * 7) % 25)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER — brief + funnel (flex-1) */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className="flex items-center justify-between gap-4 px-6 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
              <div className="min-w-0">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="mt-1.5 h-3 w-56 rounded" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-hidden p-6">
            {/* funnel block */}
            <div
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="mt-3 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-3/4 rounded" />
            </div>
            {/* brief block */}
            <div
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="mt-3 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-5/6 rounded" />
              <Skeleton className="mt-2 h-3 w-2/3 rounded" />
            </div>
          </div>
        </main>

        {/* RIGHT — script rail */}
        <aside
          className="shrink-0"
          style={{ width: 480, borderLeft: "1px solid var(--color-border-default)" }}
        >
          <div className="space-y-3 p-3">
            <div
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="mt-3 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-4/5 rounded" />
              <Skeleton className="mt-2 h-3 w-3/5 rounded" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
