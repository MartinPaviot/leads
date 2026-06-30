import { MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /voice-of-customer. Mirrors the page's own
// `if (loading)` branch (voice-of-customer/page.tsx) one-for-one — the real
// PageHeader (so title/icon never swap) + the mx-auto max-w-4xl column with its
// filter-pill row and 5 theme-card skeletons — so the route-fallback →
// in-page-skeleton handoff is seamless. Server component: no "use client".
export default function VoiceOfCustomerLoading() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<MessageCircle size={15} />} title="Voice of Customer" subtitle="Analyzing..." />
      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-4xl">
          {/* Category filter pills */}
          <div className="mb-6 flex flex-wrap gap-2">
            {[64, 116, 100, 92, 108, 88].map((w, i) => (
              <Skeleton key={i} className="h-6 rounded-full" style={{ width: w }} />
            ))}
          </div>
          {/* Theme cards */}
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-row flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "var(--color-bg-card)", border: "0.5px solid var(--color-border-default)" }}
              >
                <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 rounded" style={{ width: `${52 + (i * 13) % 28}%` }} />
                  <Skeleton className="mt-1.5 h-3 rounded" style={{ width: `${64 + (i * 17) % 24}%` }} />
                </div>
                <Skeleton className="h-5 w-9 flex-shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
