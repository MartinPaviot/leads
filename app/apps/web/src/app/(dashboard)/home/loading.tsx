import { HeaderSkeleton } from "@/components/ui/skeleton";
import { UpNextSkeleton } from "@/components/up-next/up-next-skeleton";

/**
 * Route-level Suspense fallback for /home. Renders the SAME <UpNextSkeleton/>
 * the client page shows while it fetches, so navigating to Up next is one
 * continuous shape (route skeleton -> client skeleton -> content) instead of
 * the old skeleton -> bare-spinner -> content morph. The page header mirrors
 * page.tsx's <PageHeader/> via <HeaderSkeleton/>.
 */
export default function HomeLoading() {
  return (
    <div className="flex h-full flex-col">
      <HeaderSkeleton subtitle />

      <div className="flex-1 overflow-auto px-4 py-6">
        <UpNextSkeleton />
      </div>
    </div>
  );
}
