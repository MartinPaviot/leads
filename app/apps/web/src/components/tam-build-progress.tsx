"use client";

import { Loader2, Check, X } from "lucide-react";
import type { TamStreamState } from "@/hooks/use-tam-stream";

interface TamBuildProgressProps {
  state: Pick<
    TamStreamState,
    "isRunning" | "progress" | "strategies" | "summary" | "terminated" | "errors"
  >;
  targetCount: number;
  onCancel: () => void;
  onDismiss?: () => void;
}

/**
 * Sticky banner rendered above the accounts table while a TAM build
 * is live. Shows current counters, the active strategies, and a
 * cancel button. Flips to a "Build complete" summary once `done`
 * lands and the user hasn't dismissed it.
 */
export function TamBuildProgress({
  state,
  targetCount,
  onCancel,
  onDismiss,
}: TamBuildProgressProps) {
  const { isRunning, progress, strategies, summary, terminated, errors } =
    state;

  // Nothing to show — stream never started or was dismissed.
  if (!isRunning && !summary && terminated === null && errors.length === 0) {
    return null;
  }

  // ── Running: live progress ──
  if (isRunning) {
    const pct = Math.min(
      100,
      Math.round(
        (Math.max(progress.insertedSoFar, progress.foundSoFar) / targetCount) *
          100,
      ),
    );

    return (
      <div
        className="w-full border-b px-6 py-2.5"
        style={{
          background: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <Loader2
            size={13}
            className="shrink-0 animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="flex items-center gap-2 text-[12px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              <span>
                Building TAM · {progress.insertedSoFar} / {targetCount}
              </span>
              <Separator />
              <span
                style={{ color: "var(--color-success)" }}
                className="font-medium"
              >
                {progress.aBurning} A-Burning
              </span>
              {progress.signalsLit.investor_overlap > 0 && (
                <>
                  <Separator />
                  <span
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {progress.signalsLit.investor_overlap} common investor
                  </span>
                </>
              )}
              {progress.signalsLit.funding_recent > 0 && (
                <>
                  <Separator />
                  <span
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {progress.signalsLit.funding_recent} recently funded
                  </span>
                </>
              )}
              {progress.signalsLit.hiring_intent > 0 && (
                <>
                  <Separator />
                  <span
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {progress.signalsLit.hiring_intent} hiring
                  </span>
                </>
              )}
            </div>

            {strategies.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {strategies.map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      color: s.done
                        ? "var(--color-text-tertiary)"
                        : "var(--color-text-secondary)",
                      background: s.done
                        ? "transparent"
                        : "var(--color-bg-hover)",
                      border: `1px solid ${
                        s.done
                          ? "var(--color-border-default)"
                          : "transparent"
                      }`,
                      opacity: s.done ? 0.6 : 1,
                    }}
                  >
                    {s.done && (
                      <Check
                        size={9}
                        style={{ color: "var(--color-text-tertiary)" }}
                      />
                    )}
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              background: "transparent",
              border: "1px solid var(--color-border-default)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Cancel
          </button>
        </div>

        <div
          className="mt-2 h-0.5 w-full rounded-full overflow-hidden"
          style={{ background: "var(--color-border-default)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background: "var(--color-accent)",
            }}
          />
        </div>
      </div>
    );
  }

  // ── Done / cancelled / error banner ──
  if (summary) {
    const litTotal =
      summary.signalsLit.investor_overlap +
      summary.signalsLit.funding_recent +
      summary.signalsLit.hiring_intent +
      summary.signalsLit.yc_company;

    return (
      <div
        className="w-full rounded-lg border px-3 py-2 mb-3 flex items-center gap-3"
        style={{
          background: "var(--color-success-soft)",
          borderColor: "var(--color-success)",
        }}
        role="status"
      >
        <Check
          size={13}
          className="shrink-0"
          style={{ color: "var(--color-success)" }}
        />
        <div className="flex-1 min-w-0 text-[12px]">
          <span
            className="font-medium"
            style={{ color: "var(--color-success)" }}
          >
            Build complete
          </span>
          <span
            className="ml-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            · {summary.companiesInserted} companies · {summary.aBurningCount}{" "}
            A-Burning · {litTotal} signals lit · {summary.warmPathsFound} warm
            intros · {Math.round(summary.durationMs / 1000)}s
          </span>
        </div>
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="shrink-0 opacity-60 hover:opacity-100"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-success)",
              cursor: "pointer",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  if (terminated === "cancelled") {
    return (
      <div
        className="w-full rounded-lg border px-3 py-2 mb-3 flex items-center gap-3 text-[12px]"
        style={{
          background: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span className="flex-1">
          Build cancelled · {state.progress.insertedSoFar} companies inserted so
          far are kept.
        </span>
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="shrink-0 opacity-60 hover:opacity-100"
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  if (terminated === "error" && errors.length > 0) {
    const last = errors[errors.length - 1];
    return (
      <div
        className="w-full rounded-lg border px-3 py-2 mb-3 text-[12px]"
        style={{
          background: "var(--color-error-soft)",
          borderColor: "var(--color-error)",
          color: "var(--color-error)",
        }}
      >
        Build failed: {last.message}
      </div>
    );
  }

  return null;
}

function Separator() {
  return (
    <span
      style={{ color: "var(--color-text-tertiary)", opacity: 0.5 }}
      aria-hidden
    >
      ·
    </span>
  );
}
