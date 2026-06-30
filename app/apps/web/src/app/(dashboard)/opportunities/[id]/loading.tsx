import { DetailPageSkeleton } from "@/components/ui/skeleton";

// Detail-shaped Suspense fallback for /opportunities/[id] (the list route's
// opportunities/loading.tsx kanban is otherwise the nav fallback). Mirrors the
// page's own loading branch (DetailPageSkeleton avatar="square").
export default function Loading() {
  return <DetailPageSkeleton avatar="square" />;
}
