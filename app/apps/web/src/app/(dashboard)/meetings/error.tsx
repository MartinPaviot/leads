"use client";

import { RouteErrorFallback } from "@/components/route-error-fallback";

export default function MeetingsError({
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
      contextTag="meetings"
      title="Couldn't load your meetings"
      description="Your calendar data is safe — this is a display issue. Try again, or head back to your dashboard."
    />
  );
}
