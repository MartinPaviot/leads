"use client";

import { RouteErrorFallback } from "@/components/route-error-fallback";

export default function AccountsError({
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
      contextTag="accounts"
      title="Couldn't load your accounts"
      description="Your data is safe — this is a display issue. Try again, or jump back to your dashboard."
    />
  );
}
