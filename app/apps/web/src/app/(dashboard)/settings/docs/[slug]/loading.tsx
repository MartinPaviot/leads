import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for a single Method doc step (/settings/docs/[slug]).
 *
 * Renders INSIDE the settings shell (layout.tsx keeps SettingsSidebar + the
 * centered pane mounted; Next swaps only the page slot). So we mirror the
 * page's own content root — its `px-6` wrapper, the "The Method" back-link, a
 * `SettingsHeader`-shaped title + subtitle, the markdown article body
 * (`DocBlocks`: headings + paragraph line stacks), and the prev/next step nav
 * under a top border — rather than a generic detail/table footprint. First
 * paint == loaded paint, no morph.
 */
export default function Loading() {
  return (
    <div className="px-6">
      {/* "The Method" back-link (ArrowLeft + label). */}
      <Skeleton className="mb-4 h-3 w-24 rounded" />

      {/* SettingsHeader stub — stacked title + subtitle (mb-6). */}
      <div className="mb-6">
        <Skeleton className="h-7 w-64 rounded" />
        <Skeleton className="mt-1.5 h-3.5 w-80 rounded" />
      </div>

      {/* Article body (DocBlocks) — heading + paragraph line stacks. */}
      <div>
        <div className="mb-3.5 space-y-2.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>

        <Skeleton className="mt-9 mb-3 h-4 w-52 rounded" />
        <div className="mb-3.5 space-y-2.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-11/12 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>

        <Skeleton className="mt-9 mb-3 h-4 w-40 rounded" />
        <div className="mb-3.5 space-y-2.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-5/6 rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      </div>

      {/* Prev / next step nav (two bordered cards under a top border). */}
      <div
        className="mt-10 flex items-stretch justify-between gap-3 pt-5"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        <div
          className="rounded-md px-3 py-2.5"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-2 w-10 rounded" />
          <Skeleton className="mt-1 h-3 w-28 rounded" />
        </div>
        <div
          className="flex flex-col items-end rounded-md px-3 py-2.5"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-2 w-10 rounded" />
          <Skeleton className="mt-1 h-3 w-28 rounded" />
        </div>
      </div>
      <div className="h-10" />
    </div>
  );
}
