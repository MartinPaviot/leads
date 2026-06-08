"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * Modal that requires the user to type a verification string
 * (default: "DELETE") before a destructive action fires. Use for:
 *   - delete tenant / workspace
 *   - delete all data / GDPR erase
 *   - bulk delete >50 items
 *
 * Lighter actions (single-row delete, archive) should use a plain
 * confirm modal — the typed-verify friction is designed to stop the
 * "meant to click the other button" class of accident, not every
 * delete.
 */
export function DestructiveConfirm({
  open,
  title,
  description,
  verifyWord = "DELETE",
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  verifyWord?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = typed === verifyWord && !busy;

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="destructive-confirm-title"
      aria-describedby="destructive-confirm-desc"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay, rgba(0,0,0,0.4))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
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
        <div className="mb-3 flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{
              background: "rgba(220,38,38,0.08)",
              color: "var(--color-error, #b91c1c)",
            }}
          >
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1">
            <h2
              id="destructive-confirm-title"
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h2>
            <p
              id="destructive-confirm-desc"
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {description}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={13} />
          </button>
        </div>

        <label
          className="mb-1 block text-[11px] font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          Type <strong>{verifyWord}</strong> to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="w-full rounded-md px-2.5 py-1.5 text-[13px] outline-none font-mono"
          style={{
            background: "var(--color-bg-page)",
            color: "var(--color-text-primary)",
            border: `1px solid ${
              typed && !canConfirm
                ? "var(--color-error, #b91c1c)"
                : "var(--color-border-default)"
            }`,
          }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--color-error, #b91c1c)" }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
