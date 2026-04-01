"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ background: "var(--color-error-soft)" }}
      >
        <span className="text-xl" style={{ color: "var(--color-error)" }}>!</span>
      </div>
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Something went wrong
      </h2>
      <p
        className="max-w-sm text-center text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="rounded-md px-4 py-2 text-[12px] font-medium text-white transition-colors"
        style={{ background: "var(--color-accent)" }}
      >
        Try again
      </button>
    </div>
  );
}
