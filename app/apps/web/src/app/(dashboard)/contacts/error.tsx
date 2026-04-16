"use client";

import { RouteErrorFallback } from "@/components/route-error-fallback";

export default function ContactsError({
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
      contextTag="contacts"
      title="Couldn't load your contacts"
      description="Your data is safe — this is a display issue. Retry the page, or head back to your dashboard."
    />
  );
}
