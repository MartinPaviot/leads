import {
  HeaderSkeleton,
  FilterBarSkeleton,
  KpiRowSkeleton,
  KanbanColumnSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

const STAGES = [
  { name: "Lead", cards: 3 },
  { name: "Qualification", cards: 2 },
  { name: "Demo", cards: 2 },
  { name: "Trial", cards: 1 },
  { name: "Proposal", cards: 2 },
  { name: "Negotiation", cards: 1 },
  { name: "Won", cards: 1 },
  { name: "Lost", cards: 0 },
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

      <div className="px-4 py-3">
        <KpiRowSkeleton count={6} />
      </div>

      <div className="flex flex-1 items-stretch gap-3 overflow-x-auto px-4 pb-3">
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
