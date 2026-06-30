import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /proposals. The page is a custom-toolbar
// header (FileText + title + subtitle + "Upload template" action) over a
// two-pane layout. The LEFT pane mirrors the page's listLoading skeleton (a
// 6-row two-line list). The RIGHT pane does NOT mirror a skeleton — on first
// paint `selected` is null and `detailLoading` is a CLICK-TIME state only (no
// deep-link auto-select), so the page's actual initial right pane is just the
// muted "Select a template…" prompt. Reproducing that (not a tall detail
// skeleton) keeps the route-fallback → first paint handoff morph-free.
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

        {/* Right: matches the page's INITIAL paint (nothing selected yet) — a
            single muted prompt line, not a detail skeleton. */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            Select a template to review its detected components.
          </p>
        </div>
      </div>
    </div>
  );
}
