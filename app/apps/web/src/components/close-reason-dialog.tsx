"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trophy } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * Y6 — capture why a deal closed when the user moves it to won/lost.
 *
 * Stored in `deal.properties.closeReason` (code) + `.closeReasonNote`
 * (free text, only when reason === "other"). Curated per outcome:
 *  - Won reasons focus on *what worked* so the data is actionable:
 *    "pricing_won" / "product_fit" / "champion" / "urgency".
 *  - Lost reasons mirror the classic churn-analysis taxonomy so the
 *    win-rate dashboard can aggregate without post-hoc cleanup:
 *    "competitor" / "price" / "timing" / "no_budget" / "no_need" /
 *    "wrong_fit" / "ghost".
 *
 * Required on both outcomes — the dialog refuses to confirm without a
 * reason. "Other" unlocks a free-text note (also required) so open-
 * ended categories still produce analysable data.
 */
export interface CloseReasonPayload {
  reason: string;
  note: string | null;
}

const WON_REASONS = [
  { value: "product_fit", label: "Strong product fit" },
  { value: "pricing_won", label: "Pricing / ROI won" },
  { value: "champion", label: "Internal champion closed it" },
  { value: "relationship", label: "Pre-existing relationship" },
  { value: "urgency", label: "Time-bound need" },
  { value: "other", label: "Other…" },
] as const;

const LOST_REASONS = [
  { value: "competitor", label: "Lost to a competitor" },
  { value: "price", label: "Price / budget" },
  { value: "timing", label: "Wrong timing" },
  { value: "no_budget", label: "No budget this year" },
  { value: "no_need", label: "No clear need" },
  { value: "wrong_fit", label: "Wrong ICP fit" },
  { value: "ghost", label: "Prospect ghosted" },
  { value: "other", label: "Other…" },
] as const;

export function CloseReasonDialog({
  open,
  outcome,
  dealName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  outcome: "won" | "lost" | null;
  dealName: string;
  onConfirm: (payload: CloseReasonPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const options = outcome === "won" ? WON_REASONS : LOST_REASONS;
  const requiresNote = reason === "other";
  const canConfirm =
    reason !== "" && (!requiresNote || note.trim().length > 0) && !busy;

  useEffect(() => {
    if (!open) {
      setReason("");
      setNote("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, busy]);

  if (!open || !outcome) return null;

  const isWon = outcome === "won";
  const Icon = isWon ? Trophy : AlertTriangle;
  const title = isWon ? "Why did this deal win?" : "Why did this deal fall through?";
  const headerBg = isWon
    ? { bg: "rgba(16,185,129,0.10)", color: "var(--color-success, #059669)" }
    : { bg: "rgba(220,38,38,0.08)", color: "var(--color-error, #b91c1c)" };

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm({
        reason,
        note: requiresNote ? note.trim() : null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-reason-title"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay, rgba(0,0,0,0.4))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={ref}
        className="w-full max-w-md rounded-xl p-5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: headerBg.bg, color: headerBg.color }}
            aria-hidden="true"
          >
            <Icon size={16} />
          </div>
          <div className="flex-1">
            <h2
              id="close-reason-title"
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              Tagging <span className="font-medium">{dealName}</span> helps the
              win-rate dashboard learn what works. Takes 5 seconds.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          {options.map((opt) => {
            const active = reason === opt.value;
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors"
                style={{
                  background: active ? "var(--color-accent-soft)" : "transparent",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                }}
              >
                <input
                  type="radio"
                  name="close-reason"
                  value={opt.value}
                  checked={active}
                  onChange={() => setReason(opt.value)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>

        {requiresNote && (
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
              Tell us more (required)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. The prospect wanted Hubspot-style sequences we don't support yet."
              className="w-full rounded-md px-2.5 py-1.5 text-[13px] outline-none"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
              autoFocus
            />
          </div>
        )}

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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: isWon ? "var(--color-success, #059669)" : "var(--color-error, #b91c1c)" }}
          >
            {busy ? "Saving…" : `Mark as ${isWon ? "won" : "lost"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
