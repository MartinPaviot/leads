"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * Delete confirmation that also lets the user cascade-delete related data in
 * one step (so they don't have to visit each page). Checkboxes are OFF by
 * default — deleting the entity only removes the entity unless a box is ticked.
 * Everything is soft-delete (recoverable from Archive).
 */
export interface CascadeOption {
  key: string;
  label: string;
  count: number;
}

export function CascadeDeleteModal({
  open,
  entityKind = "account",
  entityLabel,
  options,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  entityKind?: string;
  entityLabel: string;
  /** null = counts still loading */
  options: CascadeOption[] | null;
  busy?: boolean;
  onConfirm: (selectedKeys: string[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset the selection each time the modal (re)opens for a new entity.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, entityLabel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const withData = (options ?? []).filter((o) => o.count > 0);
  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay, rgba(0,0,0,0.4))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={ref}
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl p-5"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: "rgba(220,38,38,0.08)", color: "var(--color-error, #b91c1c)" }}
            aria-hidden="true"
          >
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Delete {entityKind}?
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{entityLabel}</span> moves to Archive (recoverable). Optionally also delete its related data:
            </p>
          </div>
        </div>

        <div className="mt-3 pl-11">
          {options === null ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading related data…</p>
          ) : withData.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>No related data attached.</p>
          ) : (
            <div className="space-y-0.5">
              {withData.map((o) => (
                <label
                  key={o.key}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
                  style={{ cursor: busy ? "default" : "pointer" }}
                  onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <input type="checkbox" checked={selected.has(o.key)} disabled={busy} onChange={() => toggle(o.key)} />
                  <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{o.label}</span>
                  <span className="ml-auto text-[12px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{o.count}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm([...selected])}
            disabled={busy}
            autoFocus
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--color-error, #b91c1c)" }}
          >
            {busy ? "Working…" : selected.size ? `Delete + ${selected.size} set${selected.size > 1 ? "s" : ""}` : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
