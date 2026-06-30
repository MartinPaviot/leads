import { HeaderSkeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function AccountsLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <HeaderSkeleton actions={4} />
      <FilterBarSkeleton tabs={3} search />

      {/* Same generic TableSkeleton the page renders on first paint (rows=8), so
          the route fallback doesn't morph a tailored 10-row table into 8 even
          rows. */}
      <div className="flex-1 overflow-hidden">
        <TableSkeleton rows={8} cols={9} />
      </div>
    </div>
  );
}
