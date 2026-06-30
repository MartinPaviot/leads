import { Skeleton, HeaderSkeleton } from "@/components/ui/skeleton";

/**
 * Route-level Suspense fallback for /graph (shown during navigation + the
 * JS-chunk load, before the page's own `if (loading)` branch can paint).
 *
 * The Context Graph page renders a PageHeader ("Context Graph") over a flex row:
 * a canvas column (controls bar + SVG force-graph) and an optional ~320px
 * (w-80) detail panel for the selected node. The page's loading branch already
 * paints an in-page footprint skeleton — a controls bar, scattered circular
 * node placeholders, and the w-80 detail panel — so this fallback reproduces
 * the SAME footprint, making the route-fallback → in-page-skeleton swap
 * seamless (no reflow when the real force-laid-out graph arrives).
 *
 * HeaderSkeleton stands in for the client PageHeader (identical 44px bar) per
 * every sibling loading.tsx.
 */
export default function GraphLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle />

      <div className="flex flex-1 overflow-hidden" aria-busy="true">
        {/* Canvas column — controls bar + scattered node placeholders */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ background: "var(--color-bg-surface)" }}>
          {/* Controls bar (mirrors the loaded filter pills + toggle + Refresh) */}
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
          >
            <Skeleton className="h-3 w-3 rounded" />
            <Skeleton className="h-3 w-10 rounded" />
            {[44, 60, 52, 56].map((w, i) => (
              <Skeleton key={i} className="h-4 rounded-full" style={{ width: w }} />
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </div>
          {/* Graph area — scattered node placeholders */}
          <div className="relative flex-1">
            {[
              { top: "24%", left: "30%", size: 48 },
              { top: "40%", left: "56%", size: 48 },
              { top: "62%", left: "38%", size: 44 },
              { top: "30%", left: "72%", size: 40 },
              { top: "70%", left: "64%", size: 40 },
              { top: "52%", left: "20%", size: 40 },
            ].map((n, i) => (
              <Skeleton
                key={i}
                className="absolute rounded-full"
                style={{ top: n.top, left: n.left, width: n.size, height: n.size }}
              />
            ))}
          </div>
        </div>

        {/* Detail-panel footprint (~320px, matches the w-80 selected-node panel) */}
        <div
          className="w-80 shrink-0"
          style={{
            borderLeft: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
          }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
            <Skeleton className="mt-1.5 h-3 w-16 rounded" />
            <Skeleton className="mt-2 h-3 w-full rounded" />
            <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
          </div>
          <div className="space-y-2 px-4 py-3">
            <Skeleton className="h-3 w-20 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-md p-2"
                style={{
                  background: "var(--color-bg-surface)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="mt-1.5 h-3 w-full rounded" />
                <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
