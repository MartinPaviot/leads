"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";

export interface PickerCategory {
  key: string;
  label: string;
  group: "firmographic" | "signal" | "custom";
  /** Known method for fetching this column's data (shown under the label). */
  source: string;
}

const GROUP_LABEL: Record<PickerCategory["group"], string> = {
  firmographic: "Firmographics",
  signal: "Signals",
  custom: "Custom",
};
const GROUP_ORDER: PickerCategory["group"][] = ["firmographic", "signal", "custom"];

/**
 * "Categories" column picker. Lets the user choose which optional
 * category-columns appear in the accounts table, grouped, each showing
 * the known method that fills it. Mirrors the EnrichMenu popover.
 *
 * Pure presentational: visibility state + persistence live in the page.
 */
export function ColumnPicker({
  categories,
  visible,
  onToggle,
  onReset,
}: {
  categories: PickerCategory[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const grouped = useMemo(() => {
    const m = new Map<PickerCategory["group"], PickerCategory[]>();
    for (const c of categories) {
      const arr = m.get(c.group) ?? [];
      arr.push(c);
      m.set(c.group, arr);
    }
    return m;
  }, [categories]);

  const visibleCount = categories.reduce((n, c) => n + (visible.has(c.key) ? 1 : 0), 0);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
        title="Show or hide category columns"
      >
        <SlidersHorizontal size={13} />
        Categories
        {visibleCount > 0 && (
          <span
            className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
          >
            {visibleCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-72 overflow-auto rounded-lg p-1.5"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-moderate)", boxShadow: "var(--shadow-floating)" }}
        >
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
              Add category columns
            </span>
            {onReset && visibleCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="text-[10px] font-medium hover:underline"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Reset
              </button>
            )}
          </div>

          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group);
            if (!items || items.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  {GROUP_LABEL[group]}
                </p>
                {items.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onToggle(c.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    title={c.source}
                  >
                    <span
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                      style={{
                        background: visible.has(c.key) ? "var(--color-accent)" : "transparent",
                        borderColor: visible.has(c.key) ? "var(--color-accent)" : "var(--color-border-moderate)",
                      }}
                    >
                      {visible.has(c.key) && <Check size={10} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{c.label}</span>
                      <span className="block truncate text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{c.source}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
