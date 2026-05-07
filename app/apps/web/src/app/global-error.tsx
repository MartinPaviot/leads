"use client";

import { useEffect } from "react";
import { logger } from "@/lib/observability/logger";

/**
 * Root-level error boundary — catches render crashes that escape the
 * dashboard-level boundary. Forwards to Sentry via `logger.error`
 * (see T1-F13). Body + html are required here because this replaces
 * the root layout when it's the one that threw.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("global-error boundary tripped", {
      err: error,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html>
      <body
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 480, padding: 24 }}>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#a3a3a3", marginBottom: 24 }}>
            An unexpected error occurred. We&apos;ve been notified; please try again.
          </p>
          {error.digest && (
            <p style={{ color: "#737373", marginBottom: 16, fontSize: 12, fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "10px 24px",
                backgroundColor: "transparent",
                color: "#e5e5e5",
                border: "1px solid #404040",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
