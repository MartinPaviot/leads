"use client";

import { RouteErrorFallback } from "@/components/route-error-fallback";

export default function OpportunitiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      contextTag="opportunities"
      title="Couldn't load your pipeline"
      description="Your deals are safe — this is a display issue. Try again, or jump back to your dashboard."
    />
  );
}
