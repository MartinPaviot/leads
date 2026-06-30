import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /skills. Mirrors the page's own `if
// (loading)` branch (skills/page.tsx) one-for-one — same 44px header shell
// (icon + title left, view toggle + Create button right), same 280px
// SkillSidebar column (3 collapsible sections, 3 rows each), same bordered
// detail pane — so the route-fallback → in-page-skeleton handoff is seamless
// (no header swap, no column reflow). Server component: no "use client".
export default function SkillsLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header shell — matches the loaded 44px PageHeader (icon + title left,
          view toggle + Create button right) */}
      <div
        className="flex shrink-0 items-center justify-between px-6"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-[120px] rounded-md" />
          <Skeleton className="h-7 w-[104px] rounded-md" />
        </div>
      </div>

      {/* Content — sidebar + detail pane columns reserved (list view) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex w-[280px] shrink-0 flex-col overflow-y-auto"
          style={{ background: "var(--color-bg-sidebar)" }}
        >
          <div className="py-2">
            {Array.from({ length: 3 }).map((_, s) => (
              <div key={s}>
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <div className="space-y-0.5 px-1 pb-1">
                  {Array.from({ length: 3 }).map((_, r) => (
                    <div key={r} className="flex items-center gap-2 px-3 py-1.5">
                      <Skeleton className="h-3.5 w-3.5 rounded" />
                      <Skeleton
                        className="h-3 rounded"
                        style={{ width: `${55 + ((s * 3 + r) * 13) % 35}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-6"
          style={{ borderLeft: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-5 w-44 rounded" />
          <Skeleton className="mt-3 h-3 w-full rounded" />
          <Skeleton className="mt-2 h-3 w-3/4 rounded" />
          <Skeleton className="mt-2 h-3 w-2/3 rounded" />
        </div>
      </div>
    </div>
  );
}
