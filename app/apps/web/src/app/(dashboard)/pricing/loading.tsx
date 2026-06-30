import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /pricing. The page (pricing/page.tsx) is a
// mostly-static centered header + a 3-column plan-card grid (no in-page loading
// branch — the tiers render immediately, only the "Current Plan" marker streams
// in). So this mirrors that footprint: a centered title/subtitle block plus a
// md:grid-cols-3 grid of plan-card skeletons (name, price, CTA, feature list),
// with the middle card highlighted like "Most Popular" — so the fallback → page
// swap has no reflow.
const PLAN_CARDS: Array<{ features: number; highlighted: boolean }> = [
  { features: 7, highlighted: false },
  { features: 9, highlighted: true },
  { features: 11, highlighted: false },
];

export default function PricingLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Centered header (matches the 32px title + subtitle) */}
      <div className="flex flex-col items-center text-center">
        <Skeleton className="h-8 w-80 rounded" />
        <Skeleton className="mt-4 h-3.5 w-96 max-w-full rounded" />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {PLAN_CARDS.map((card, i) => (
          <div
            key={i}
            className="relative flex flex-col rounded-xl p-6"
            style={{
              background: "var(--color-bg-card)",
              border: card.highlighted
                ? "2px solid var(--color-accent)"
                : "1px solid var(--color-border-default)",
            }}
          >
            {card.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            )}

            {/* Tier name */}
            <Skeleton className="h-4 w-24 rounded" />
            {/* Price + note */}
            <div className="mt-3 flex items-baseline gap-2">
              <Skeleton className="h-9 w-20 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
            {/* Description */}
            <Skeleton className="mt-3 h-3 w-full rounded" />
            <Skeleton className="mt-1.5 h-3 w-2/3 rounded" />

            {/* CTA button */}
            <Skeleton className="mt-6 h-9 w-full rounded-md" />

            {/* Divider */}
            <div className="my-6 h-px" style={{ background: "var(--color-border-default)" }} />

            {/* Feature list */}
            <div className="flex-1 space-y-2.5">
              {Array.from({ length: card.features }).map((_, f) => (
                <div key={f} className="flex items-start gap-2.5">
                  <Skeleton className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded" />
                  <Skeleton className="h-3 rounded" style={{ width: `${60 + ((i + f) * 11) % 30}%` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
