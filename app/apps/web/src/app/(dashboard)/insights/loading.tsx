import { HeaderSkeleton } from "@/components/ui/skeleton";

// Mirror the page's OWN first-paint loader (its `if (loading)` branch): a
// title-only header (PageHeader has no subtitle / actions) over a `flex-1 p-5`
// body with an animate-pulse stack of three h-32 blocks — NOT the stale
// 5-row list shape this used to paint. Keeping route-fallback == page-loading
// state means the screen doesn't morph when the client page mounts.
export default function InsightsLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle={false} />

      <div className="flex-1 p-5">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-lg"
              style={{ background: "var(--color-bg-secondary)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
