"use client";

import { RouteErrorFallback } from "@/components/route-error-fallback";

export default function SequencesError({
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
      contextTag="sequences"
      title="Couldn't load your sequences"
      description="Your campaigns are safe and any in-flight emails will keep sending. Try the page again, or head back to your dashboard."
    />
  );
}
