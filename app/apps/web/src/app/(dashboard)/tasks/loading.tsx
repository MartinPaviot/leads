import { HeaderSkeleton, FilterBarSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={1} />
      <FilterBarSkeleton tabs={4} />

      {/* Add-task bar — the page renders this persistent input row between the
          filter bar and the list, so the skeleton must reserve its height or the
          whole list jumps down ~48px when the page mounts. */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

      {/* List — same three-bar loader the page itself shows while fetching. */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
