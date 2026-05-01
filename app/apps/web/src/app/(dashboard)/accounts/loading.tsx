import {
  HeaderSkeleton,
  FilterBarSkeleton,
  Skeleton,
  TableRowSkeleton,
} from "@/components/ui/skeleton";

const ROW_SHAPE = [
  { width: 14, circle: true },
  { width: 180 },
  { width: 80 },
  { width: 60, pill: true },
  { width: 40 },
  { width: 45 },
  { width: 40, pill: true },
  { width: 22, circle: true },
  { width: 40 },
] as const;

export default function AccountsLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <HeaderSkeleton actions={4} />
      <FilterBarSkeleton tabs={3} search />

      <div className="flex-1 overflow-hidden">
        {/* Table header */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ height: "var(--table-row-height)", borderBottom: "1px solid var(--color-border-default)" }}
        >
          <Skeleton className="h-3.5 w-3.5 rounded" />
          {[90, 70, 55, 45, 45, 45, 45, 55, 50].map((w, i) => (
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
