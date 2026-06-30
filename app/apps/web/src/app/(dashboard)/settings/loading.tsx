import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for the Settings segment.
 *
 * This renders INSIDE the settings shell: `layout.tsx` keeps `SettingsSidebar`
 * (the nav rail + the centered content pane) mounted, and Next.js swaps only the
 * page slot for this fallback. So we must NOT paint an app-bar `HeaderSkeleton`
 * (the settings header is a stacked `SettingsHeader`, not a full-width app-bar)
 * and must NOT add our own width/padding wrapper — the pane already provides it.
 * We mirror the default Overview landing (page.tsx): a SettingsHeader-shaped
 * title + subtitle, a 2-col stat-card grid, the "Tune your AI" heading, and four
 * link rows — so first paint == loaded paint with no morph.
 */

const LINK_ROWS = [
  { title: 116, sub: 232 },
  { title: 70, sub: 196 },
  { title: 82, sub: 188 },
  { title: 128, sub: 248 },
];

export default function SettingsLoading() {
  return (
    <>
      {/* SettingsHeader stub — stacked title + subtitle (mb-6). */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-64 rounded" />
        </div>
      </div>

      {/* Live state — autonomy + channels (2 stat cards). */}
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="skeleton-row flex flex-col rounded-xl p-4"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              {i === 0 && <Skeleton className="h-3 w-14 rounded" />}
            </div>
            <Skeleton className="mt-2 h-5 w-24 rounded" />
            <Skeleton className="mt-1.5 h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* "Tune your AI" section heading. */}
      <div className="mt-8 mb-2 px-0.5">
        <Skeleton className="h-2.5 w-20 rounded" />
      </div>

      {/* Where to tune the AI (4 link rows). */}
      <div className="space-y-2">
        {LINK_ROWS.map((row, i) => (
          <div
            key={i}
            className="skeleton-row flex items-center gap-3 rounded-lg p-3"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--color-bg-hover)" }}
            >
              <Skeleton className="h-3.5 w-3.5 rounded" />
            </span>
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 rounded" style={{ width: row.title }} />
              <Skeleton className="mt-1.5 h-2.5 rounded" style={{ width: row.sub }} />
            </div>
            <Skeleton className="h-3 w-3 rounded" />
          </div>
        ))}
      </div>
    </>
  );
}
