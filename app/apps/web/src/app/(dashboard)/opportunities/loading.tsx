import {
  HeaderSkeleton,
  FilterBarSkeleton,
  KanbanColumnSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

// Mirror the page's own first-paint kanban — the same six stages and card counts
// — so the board doesn't morph 8→6 columns (dropping a "Trial" column and an
// empty "Lost" column) when the client page mounts. The KPI strip is intentionally
// absent: the page only renders it once analytics has loaded (and only when there
// are deals), so painting a 6-card KPI skeleton here would just flash and vanish.
const STAGES = [
  { name: "Lead", cards: 3 },
  { name: "Qualification", cards: 2 },
  { name: "Demo", cards: 2 },
  { name: "Proposal", cards: 1 },
  { name: "Negotiation", cards: 1 },
  { name: "Won", cards: 1 },
];

export default function OpportunitiesLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-card)" }}>
      <HeaderSkeleton actions={4} />
      <FilterBarSkeleton tabs={0} search>
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <div className="ml-auto flex gap-0.5 rounded-md overflow-hidden" style={{ border: "1px solid var(--color-border-default)" }}>
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-14" />
        </div>
      </FilterBarSkeleton>

      <div className="flex flex-1 items-stretch gap-3 overflow-x-auto px-4 py-3">
        {STAGES.map((stage, idx) => (
          <KanbanColumnSkeleton
            key={stage.name}
            name={stage.name}
            cards={stage.cards}
            index={idx}
          />
        ))}
      </div>
    </div>
  );
}
