"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * E5 — medium-weight destructive/confirm modal. Sits between:
 *   - native `window.confirm()` (ugly, non-themed, no focus trap)
 *   - `<DestructiveConfirm>` typed-verify modal (friction for
 *     workspace-wide wipes, GDPR erase, etc.)
 *
 * Use this for actions that are reversible-enough (cancel invitation,
 * remove a mailbox, revoke one API key) but still shouldn't fire from
 * a stray click — a single confirmation step is the right amount of
 * friction.
 *
 * `variant="destructive"` colours the confirm button red and uses the
 * warning icon; `variant="default"` keeps it neutral for non-destructive
 * confirms ("Leave without saving?").
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** External busy flag — parent can pass `true` while the awaited
   *  handler is in flight so the button shows a pending state. */
  busy?: boolean;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDestructive = variant === "destructive";
  const confirmBg = isDestructive
    ? "var(--color-error, #b91c1c)"
    : "var(--color-accent)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay, rgba(0,0,0,0.4))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={ref}
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl p-5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="flex items-start gap-3">
          {isDestructive && (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{
                background: "rgba(220,38,38,0.08)",
                color: "var(--color-error, #b91c1c)",
              }}
              aria-hidden="true"
            >
              <AlertTriangle size={16} />
            </div>
          )}
          <div className="flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            autoFocus
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: confirmBg }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
