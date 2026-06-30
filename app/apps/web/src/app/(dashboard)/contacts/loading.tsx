import { HeaderSkeleton, FilterBarSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function ContactsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={4} />
      {/* FilterBar: the page shows two left anchors ("All (N)" + "Filtres") and a
          search box — mirror that instead of a lone right-aligned search. */}
      <FilterBarSkeleton>
        <Skeleton className="h-6 w-16 rounded-md" />
        <Skeleton className="h-6 w-16 rounded-md" />
        <Skeleton className="ml-auto h-7 w-64 rounded-md" />
      </FilterBarSkeleton>

      {/* Same generic TableSkeleton the page renders on first paint (rows=5), so
          the route fallback doesn't morph a tailored 10-row table into it. */}
      <div className="flex-1 overflow-hidden">
        <TableSkeleton rows={5} cols={10} />
      </div>
    </div>
  );
}
