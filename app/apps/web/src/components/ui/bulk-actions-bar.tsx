"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

/**
 * Sticky-top action bar that appears when `count > 0`. Replaces the
 * usual page header so the selected-count + actions sit where the
 * eye already tracks. Zero state logic — controlled entirely by the
 * caller via `count` + `onClear`.
 */
export function BulkActionsBar({
  count,
  actions,
  onClear,
  primary,
  className = "",
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  /** Optional rich action rendered first (e.g. a split-button menu). */
  primary?: ReactNode;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={`${count} items selected`}
      className={`sticky top-0 z-20 flex items-center gap-2 border-b px-4 py-2 ${className}`.trim()}
      style={{
        background: "var(--color-bg-selected, var(--color-bg-card))",
        borderColor: "var(--color-border-default)",
      }}
    >
      <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {primary}
        {actions.map((a, i) => (
          <button
            key={`${a.label}-${i}`}
            disabled={a.disabled}
            onClick={a.onClick}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            style={
              a.variant === "danger"
                ? { color: "var(--color-error, #b91c1c)", borderColor: "var(--color-border-default)" }
                : { color: "var(--color-text-secondary)", borderColor: "var(--color-border-default)" }
            }
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        <button
          onClick={onClear}
          aria-label="Clear selection"
          className="ml-1 flex h-6 w-6 items-center justify-center rounded transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
