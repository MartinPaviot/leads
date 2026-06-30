import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

// Mirror deliverability/page.tsx's real first paint: a full-width domain
// authentication (SPF / DKIM / DMARC) card, then the six-up KPI grid the page
// renders once metrics load. There is no chart on this page — the previous
// skeleton painted a 3-card grid + a tall h-40 "chart" card, both of which
// morphed away when the client page mounted. The KPI grid here matches the
// page's exact breakpoints (grid-cols-2 md:grid-cols-3 lg:grid-cols-6, gap-3,
// p-4 cards), so KpiRowSkeleton is intentionally not used (it grids differently).
export default function DeliverabilityLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle />

      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Domain authentication (SPF / DKIM / DMARC) card — full width */}
        <div
          className="skeleton-row mb-4 rounded-lg p-4"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
        >
          <div className="mb-3">
            <Skeleton className="h-3.5 w-64 rounded" />
            <Skeleton className="mt-1.5 h-2.5 w-72 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>

        {/* KPI grid — Sent / Open / Reply / Bounce / Spam / Replied */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeleton-row rounded-lg p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <Skeleton className="h-2.5 w-12 rounded" />
              <Skeleton className="mt-2 h-6 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
