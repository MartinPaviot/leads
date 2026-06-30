import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /proposals. The page is a custom-toolbar
// header (FileText + title + subtitle + "Upload template" action) over a
// two-pane layout, and it renders its OWN in-page skeletons on first paint:
// a 6-row two-line list skeleton (listLoading) on the left and a detail-panel
// skeleton (header block + 5 component rows) on the right. This reproduces the
// SAME footprint — HeaderSkeleton (actions=1 ≈ the upload button) + both panes
// — so the route-fallback → in-page-skeleton transition is seamless (no morph).
const LIST_ROW_WIDTHS = [72, 55, 83, 60, 76, 50];

export default function ProposalsLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <HeaderSkeleton actions={1} />

      <div className="flex min-h-0 flex-1">
        {/* Left: template list (mirrors the page's listLoading skeleton) */}
        <div
          className="w-72 shrink-0 overflow-y-auto p-2"
          style={{ borderRight: "1px solid var(--color-border-default)" }}
          aria-hidden
        >
          {LIST_ROW_WIDTHS.map((w, i) => (
            <div key={i} className="mb-1 flex flex-col gap-1.5 rounded-md px-3 py-2">
              <Skeleton className="h-3 rounded" style={{ width: `${w}%` }} />
              <Skeleton className="h-2 w-12 rounded" />
            </div>
          ))}
        </div>

        {/* Right: review/detail panel (mirrors the page's detailLoading skeleton) */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="mt-1.5 h-3 w-32 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md p-2"
                  style={{ border: "1px solid var(--color-border-default)" }}
                >
                  <Skeleton className="h-7 w-20 rounded" />
                  <Skeleton className="h-7 flex-1 rounded" />
                  <Skeleton className="h-7 w-28 rounded" />
                  <Skeleton className="h-4 w-10 rounded" />
                  <Skeleton className="h-6 w-14 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
