import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for the WHOLE Settings segment.
 *
 * This is the only `loading.tsx` in `settings/`, so it is the Suspense fallback
 * for every settings sub-route (icp, autonomy, llm-budget, ...), not just the
 * Overview index. It must therefore stay NEUTRAL and content-agnostic — a
 * recognizable Overview shape (stat-card grid / "Tune your AI" heading / link
 * rows) would flash the wrong layout on every sub-route, then morph into that
 * route's own in-page skeleton, then data.
 *
 * It renders INSIDE the settings shell: `layout.tsx` keeps `SettingsSidebar`
 * (the nav rail + the centered content pane) mounted, and Next.js swaps only the
 * page slot for this fallback. So we must NOT paint an app-bar `HeaderSkeleton`
 * (the settings header is a stacked `SettingsHeader`, not a full-width app-bar)
 * and must NOT add our own width/padding wrapper — the pane already provides it.
 */

export default function SettingsLoading() {
  return (
    <>
      {/* SettingsHeader-height stub — stacked title + subtitle (mb-6). */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-64 rounded" />
        </div>
      </div>

      {/* Generic full-width content blocks — no recognizable per-route layout. */}
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </>
  );
}
