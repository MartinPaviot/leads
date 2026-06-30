import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

// Route-level Suspense fallback for /knowledge (shown during navigation + JS
// chunk load, before the page's own `if (loading)` branch can paint). Mirrors
// that in-page branch EXACTLY — the real PageHeader (BookOpen + "Knowledge")
// over a 280px sidebar of four rows + a detail panel — so the route-fallback →
// in-page-skeleton handoff is seamless (no header/body morph). The page is a
// sidebar/detail layout, not a flat entry list, so this matches that footprint
// rather than a generic table. Static skeleton, no "use client".
export default function KnowledgeLoading() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<BookOpen size={16} />} title="Knowledge" />
      <div className="flex flex-1">
        {/* Sidebar skeleton — same four entry rows the page paints while fetching. */}
        <div
          className="w-[280px] shrink-0 space-y-3 p-4"
          style={{ borderRight: "1px solid var(--color-border-default)" }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md"
              style={{ background: "var(--color-bg-hover)" }}
            />
          ))}
        </div>
        {/* Detail skeleton — title bar + body block. */}
        <div className="flex-1 p-6">
          <div
            className="h-8 w-48 animate-pulse rounded-md"
            style={{ background: "var(--color-bg-hover)" }}
          />
          <div
            className="mt-4 h-64 animate-pulse rounded-md"
            style={{ background: "var(--color-bg-hover)" }}
          />
        </div>
      </div>
    </div>
  );
}
