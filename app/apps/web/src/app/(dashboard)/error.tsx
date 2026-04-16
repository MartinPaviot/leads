"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Dashboard-scoped error boundary. Catches crashes in any page under
 * `(dashboard)` without nuking the sidebar + header. Forwards to
 * Sentry via `logger.error` (T1-F13) so we get a breadcrumb even
 * when the user clicks Reset and the UI recovers.
 *
 * Per-route error boundaries (E3) override this for known surfaces
 * with contextual copy; this catch-all stays as the safety net for
 * unrouted crashes.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    logger.error("dashboard error boundary tripped", {
      err: error,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <EmptyState
        variant="error"
        title="Something went wrong"
        description={
          error.digest
            ? `An unexpected error occurred. Reference: e_${error.digest}`
            : "An unexpected error occurred. Try again, or head back to the dashboard."
        }
        actionLabel="Try again"
        onAction={reset}
        actionVariant="solid"
        secondaryActionLabel="Go home"
        onSecondaryAction={() => router.push("/home")}
      />
    </div>
  );
}
