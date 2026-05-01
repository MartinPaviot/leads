import {
  HeaderSkeleton,
  FilterBarSkeleton,
  Skeleton,
  TableRowSkeleton,
} from "@/components/ui/skeleton";

const ROW_SHAPE = [
  { width: 14, circle: true },
  { width: 140 },
  { width: 80 },
  { width: 100 },
  { width: 70, pill: true },
  { width: 50 },
  { width: 50 },
  { width: 22, circle: true },
  { width: 40 },
] as const;

export default function ContactsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton actions={4} />
      <FilterBarSkeleton search />

      <div className="flex-1 overflow-hidden">
        <div
          className="flex items-center gap-3 px-4"
          style={{ height: "var(--table-row-height)", borderBottom: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-3.5 w-3.5 rounded" />
          {[80, 70, 90, 70, 55, 50, 45, 55].map((w, i) => (
            <Skeleton key={i} className="h-2.5 rounded" style={{ width: w }} />
          ))}
        </div>

        {Array.from({ length: 10 }).map((_, r) => (
          <TableRowSkeleton key={r} index={r} cells={[...ROW_SHAPE]} />
        ))}
      </div>
    </div>
  );
}
