import { DetailPageSkeleton } from "@/components/ui/skeleton";

// Detail-shaped Suspense fallback for /contacts/[id] (the list route's
// contacts/loading.tsx table is otherwise the nav fallback). Mirrors the page's
// own loading branch (DetailPageSkeleton avatar="circle").
export default function Loading() {
  return <DetailPageSkeleton avatar="circle" />;
}
