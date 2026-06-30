import { ArrowLeft, GitMerge } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { MergeSkeleton } from "./_merge-skeleton";

// Suspense fallback for /contacts/merge. Without this, the LIST route's
// contacts/loading.tsx (a full 10-col table + filter bar + 4 actions) is the
// navigation fallback, which then morphed into merge's own MergeSkeleton (two
// group cards). Mirrors the page's in-page loading branch exactly — persistent
// PageHeader chrome (subtitle is "Auto-detected duplicates" while loading,
// since curated contacts aren't resolved yet) + MergeSkeleton body — so the
// route fallback is pixel-identical to the page's own skeleton (no morph).
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<GitMerge size={16} />} title="Merge contacts" subtitle="Auto-detected duplicates">
        <Button variant="outline" size="sm" icon={<ArrowLeft size={12} />}>
          Back to contacts
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-5 pb-5 pt-3">
        <MergeSkeleton />
      </div>
    </div>
  );
}
