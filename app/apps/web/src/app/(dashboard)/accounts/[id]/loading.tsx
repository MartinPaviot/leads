import { DetailPageSkeleton } from "@/components/ui/skeleton";

// Detail-shaped Suspense fallback for /accounts/[id]. Without this, the LIST
// route's accounts/loading.tsx (a full table) is the navigation fallback, so
// opening one account flashed a table before the detail skeleton. Mirrors the
// page's own loading branch (DetailPageSkeleton avatar="square").
export default function Loading() {
  return <DetailPageSkeleton avatar="square" />;
}
