import { HeaderSkeleton, FilterBarSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Mirror the page's real first paint: header + a search/sort filter bar +
          the note-input textarea bar + a single-column list loader — NOT the
          3-column masonry card grid (a removed design) the page never renders. */}
      <HeaderSkeleton actions={1} />

      <FilterBarSkeleton>
        <Skeleton className="h-7 w-52 rounded-md" />
        <Skeleton className="ml-auto h-7 w-20 rounded-md" />
      </FilterBarSkeleton>

      {/* Note input bar */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <Skeleton className="h-14 w-full rounded-md" />
      </div>

      {/* Notes list — same three-bar loader the page itself shows while fetching. */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-2 p-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
