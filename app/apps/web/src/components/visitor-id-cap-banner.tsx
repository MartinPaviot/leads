"use client";

/**
 * VisitorIdCapBanner — surfaces the tenant's visitor-ID monthly
 * spend status when it's approaching or has hit the cap (P0-2
 * follow-up).
 *
 * Three rendered states :
 *  - hidden    : healthy spend (< warning threshold). Returns null.
 *  - warning   : within $5 / 10% of cap. Amber banner with the
 *                remaining headroom + a deep-link to settings to
 *                bump the cap.
 *  - reached   : at or above cap. Red banner explaining that
 *                identifications have stopped + how to re-enable.
 *
 * Fetches once on mount via `/api/dashboard/visitor-id-spend`.
 * Silent on fetch failure (banner just stays hidden) — never blocks
 * the dashboard load.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

interface SpendSnapshot {
  spendUsd: number;
  capUsd: number;
  remainingUsd: number;
  reached: boolean;
  warning: boolean;
  asOf: string;
}

const DISMISS_KEY_PREFIX = "elevay:visitor-id-cap-banner:dismissed";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtUsd(n: number): string {
  // Small amounts keep cents so a $2.50 banner reads accurately ;
  // large amounts round to whole dollars to keep the line readable.
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function VisitorIdCapBanner() {
  const [snapshot, setSnapshot] = useState<SpendSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/visitor-id-spend");
        if (!res.ok) return;
        const data = (await res.json()) as SpendSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // Silent — banner stays hidden on network failure.
      }
    })();
    // Read dismissal from localStorage. We dedupe per-day so the
    // banner re-appears tomorrow if the warning persists.
    try {
      if (typeof window !== "undefined") {
        const key = `${DISMISS_KEY_PREFIX}:${todayKey()}`;
        if (window.localStorage.getItem(key) === "1") {
          setDismissed(true);
        }
      }
    } catch {
      // Private mode / disabled storage — treat as not-dismissed.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) return null;
  if (!snapshot.reached && !snapshot.warning) return null;
  if (dismissed && !snapshot.reached) {
    // Reached banners can't be dismissed — they signal a hard stop
    // that needs immediate action. Warning banners can.
    return null;
  }

  const reached = snapshot.reached;
  const palette = reached
    ? {
        bg: "rgba(220,38,38,0.08)",
        border: "var(--color-error, #b91c1c)",
        accent: "var(--color-error, #b91c1c)",
      }
    : {
        bg: "rgba(217,119,6,0.08)",
        border: "var(--color-warning, #d97706)",
        accent: "var(--color-warning, #d97706)",
      };

  function dismiss() {
    setDismissed(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `${DISMISS_KEY_PREFIX}:${todayKey()}`,
          "1",
        );
      }
    } catch {
      // Private mode — in-memory dismissal still applies.
    }
  }

  return (
    <div
      role="alert"
      className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0"
        style={{ color: palette.accent }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {reached
            ? "Visitor identification paused — monthly cap reached"
            : "Visitor identification approaching monthly cap"}
        </p>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {reached ? (
            <>
              You&apos;ve hit your{" "}
              <strong>{fmtUsd(snapshot.capUsd)}</strong> visitor-ID budget for
              this month ({fmtUsd(snapshot.spendUsd)} spent). New visits will
              keep landing but won&apos;t be matched to companies until next
              month — or until you raise the cap.
            </>
          ) : (
            <>
              {fmtUsd(snapshot.spendUsd)} of your{" "}
              <strong>{fmtUsd(snapshot.capUsd)}</strong> monthly cap spent —
              <strong> {fmtUsd(snapshot.remainingUsd)}</strong> left before
              identifications pause.
            </>
          )}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-1 text-[12px] font-medium underline"
            style={{ color: palette.accent }}
          >
            Adjust cap <ExternalLink size={10} aria-hidden />
          </Link>
          <span
            className="text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Updated {new Date(snapshot.asOf).toLocaleString()}
          </span>
        </div>
      </div>
      {!reached && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="shrink-0 rounded p-1"
          style={{ color: palette.accent }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
