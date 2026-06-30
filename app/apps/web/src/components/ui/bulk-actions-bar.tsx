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
  countLabel,
  clearLabel,
  className = "",
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  /** Optional rich action rendered first (e.g. a split-button menu). */
  primary?: ReactNode;
  /** Localized "{n} selected" text. Falls back to English when omitted. */
  countLabel?: string;
  /** Localized aria-label for the clear (×) button. */
  clearLabel?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={countLabel ?? `${count} items selected`}
      // `relative` (not `sticky top-0`): the bar now sits in the non-scrolling
      // header stack BELOW the filter bar, so sticky-to-top would pin it to the
      // dashboard root scroll container and let it re-overlap the page header on
      // scroll. `relative z-30` gives it a stacking context for the menus AND
      // keeps it ABOVE the table's sticky `.ls-table th` (z-index:20): the bar's
      // grouped-action / enrich dropdowns open down over the table, so at z-20
      // they tied with the sticky category headers and lost on paint order (the
      // table is later in the DOM) — i.e. the dropdown rendered BEHIND the column
      // headers. z-30 wins that overlap; modals/drawers stay above at z-40/z-50.
      // `shrink-0` holds its height in the flex column.
      className={`relative z-30 shrink-0 flex items-center gap-2 border-b px-4 py-2 ${className}`.trim()}
      style={{
        background: "var(--color-bg-selected, var(--color-bg-card))",
        borderColor: "var(--color-border-default)",
      }}
    >
      <span className="shrink-0 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
        {countLabel ?? `${count} selected`}
      </span>
      {/* flex-1 + flex-wrap so the actions stay reachable on a narrow / zoomed
          viewport (founder runs half-screen + 200% zoom): instead of overflowing
          off the right edge with no scroll, the buttons wrap onto the next line.
          On a wide viewport everything still fits on one right-aligned row. */}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
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
          aria-label={clearLabel ?? "Clear selection"}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
