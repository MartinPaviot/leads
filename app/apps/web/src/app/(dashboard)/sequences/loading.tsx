import { HeaderSkeleton } from "@/components/ui/skeleton";

export default function SequencesLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Mirror the page's own first paint: two header actions (Modèles + New
          campaign) and a single-column list of three bars — NOT a 3-column card
          grid — so the route fallback doesn't morph into the real list on load. */}
      <HeaderSkeleton actions={2} />

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg"
              style={{ background: "var(--color-bg-hover)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
