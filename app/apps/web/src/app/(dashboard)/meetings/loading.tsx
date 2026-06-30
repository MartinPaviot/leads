import { HeaderSkeleton } from "@/components/ui/skeleton";

export default function MeetingsLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Mirror the page's own first paint: NO filter bar (the page has none —
          its header carries a view toggle, not a FilterBar) and four cards, so
          the route fallback doesn't flash a phantom 3-tab filter bar + 6 cards
          that then collapse on mount. */}
      <HeaderSkeleton subtitle={false} />
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton-row flex items-start gap-4 rounded-lg p-4"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="shrink-0" style={{ width: 52 }}>
              <div className="skeleton h-4 w-12 rounded" />
              <div className="skeleton mt-1 h-3 w-8 rounded" />
            </div>
            <div className="flex-1">
              <div className="skeleton h-4 rounded" style={{ width: `${140 + i * 20}px` }} />
              <div className="mt-2 flex items-center gap-2">
                <div className="skeleton h-5 w-5 rounded-full" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
