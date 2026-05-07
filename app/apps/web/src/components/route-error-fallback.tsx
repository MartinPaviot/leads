"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/observability/logger";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * E3 — shared fallback used by per-route error.tsx files.
 *
 * Each Next.js error.tsx accepts `(error, reset)` from the framework
 * and just delegates here, supplying a contextual title/description so
 * the user sees "Couldn't load your accounts" instead of the generic
 * "Something went wrong" — important because the route error boundary
 * isolates the crash to that segment, leaving the dashboard chrome
 * intact, so the user knows exactly which surface failed.
 *
 * The component logs once on mount via `logger.error`, which is the
 * Sentry hand-off point (T1-F13). `error.digest` is the opaque ID
 * Next.js generates for the server-side trace; we surface it in the
 * UI so a support conversation can pivot directly to the trace.
 */
export interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** What broke, in plain language. "Couldn't load your accounts" works. */
  title: string;
  /** One-sentence reassurance. "Your data is safe — just a display hiccup." */
  description: string;
  /** Logger context tag, e.g. "accounts-route-error". */
  contextTag: string;
}

export function RouteErrorFallback({
  error,
  reset,
  title,
  description,
  contextTag,
}: RouteErrorFallbackProps) {
  const router = useRouter();

  useEffect(() => {
    logger.error(`${contextTag}: route error boundary tripped`, {
      err: error,
      digest: error.digest,
    });
  }, [error, contextTag]);

  // The digest is opaque (Next.js generates `8 chars`), so prefix it
  // with `e_` to make it scannable in a support thread.
  const supportRef = error.digest ? `e_${error.digest}` : null;

  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <EmptyState
        variant="error"
        title={title}
        description={
          supportRef
            ? `${description} If this keeps happening, share reference ${supportRef} with support.`
            : description
        }
        actionLabel="Try again"
        onAction={reset}
        actionVariant="solid"
        secondaryActionLabel="Go to home"
        onSecondaryAction={() => router.push("/home")}
      />
    </div>
  );
}
