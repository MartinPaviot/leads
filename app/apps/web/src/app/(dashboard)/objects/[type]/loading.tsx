import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /objects/[type] — a dynamic custom-object
// record list. The page is a client component with its own early `if (loading)`
// branch (a single title in a header bar, then three row placeholders), so this
// fallback reproduces that EXACT footprint: the route-fallback → in-page-skeleton
// hand-off is seamless, with no morph into a wider table or an action-laden
// header that the loading state doesn't show.
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-[var(--header-height)] items-center px-6"
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
        }}
      >
        <Skeleton className="h-5 w-32 rounded" />
      </div>
      <div className="p-6">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
