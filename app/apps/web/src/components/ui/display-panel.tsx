"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, Check } from "lucide-react";

export interface DisplayColumn {
  key: string;
  label: string;
}

export type DisplayDensity = "compact" | "default" | "comfortable";

export interface DisplayPreferences {
  visibleColumns: string[];
  pinnedColumns: string[];
  columnOrder: string[];
  density: DisplayDensity;
}

/**
 * Dropdown panel that lives top-right of list pages. Lets the user
 * toggle column visibility, pin columns, reorder, and pick row
 * density. State is lifted to the caller — this component is
 * controlled. Persist via `/api/user-preferences` separately.
 */
export function DisplayPanel({
  columns,
  preferences,
  onChange,
  className = "",
}: {
  columns: DisplayColumn[];
  preferences: DisplayPreferences;
  onChange: (next: DisplayPreferences) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggleVisible(key: string) {
    const visible = new Set(preferences.visibleColumns);
    if (visible.has(key)) visible.delete(key);
    else visible.add(key);
    onChange({ ...preferences, visibleColumns: Array.from(visible) });
  }

  function togglePinned(key: string) {
    const pinned = new Set(preferences.pinnedColumns);
    if (pinned.has(key)) pinned.delete(key);
    else pinned.add(key);
    onChange({ ...preferences, pinnedColumns: Array.from(pinned) });
  }

  function setDensity(d: DisplayDensity) {
    onChange({ ...preferences, density: d });
  }

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
        style={{
          background: "var(--color-bg-card)",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <Columns3 size={13} /> Display
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 rounded-lg p-3"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          <h3
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Density
          </h3>
          <div className="mb-3 flex gap-1">
            {(["compact", "default", "comfortable"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className="flex-1 rounded px-2 py-1 text-[11px] font-medium"
                style={{
                  background:
                    preferences.density === d
                      ? "var(--color-bg-hover)"
                      : "transparent",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          <h3
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Columns
          </h3>
          <ul className="flex flex-col gap-0.5">
            {columns.map((c) => {
              const isVisible = preferences.visibleColumns.includes(c.key);
              const isPinned = preferences.pinnedColumns.includes(c.key);
              return (
                <li key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--color-bg-hover)]">
                  <button
                    onClick={() => toggleVisible(c.key)}
                    aria-pressed={isVisible}
                    className="flex h-4 w-4 items-center justify-center rounded"
                    style={{
                      background: isVisible ? "var(--color-accent)" : "transparent",
                      border: "1px solid var(--color-border-default)",
                      color: "white",
                    }}
                  >
                    {isVisible && <Check size={10} />}
                  </button>
                  <span className="flex-1 text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                    {c.label}
                  </span>
                  <button
                    onClick={() => togglePinned(c.key)}
                    className="text-[10px]"
                    style={{
                      color: isPinned ? "var(--color-accent)" : "var(--color-text-muted)",
                    }}
                    aria-label={isPinned ? "Unpin column" : "Pin column"}
                  >
                    {isPinned ? "Pinned" : "Pin"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
