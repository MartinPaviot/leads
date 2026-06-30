"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface MoreMenuChoice {
  label: string;
  /** Current selection marker (radio-style choice lists). */
  checked?: boolean;
  onClick: () => void;
}

export interface MoreMenuItem {
  label: string;
  icon?: React.ReactNode;
  /** Plain item action — the menu closes after it runs. */
  onClick?: () => void;
  /** Active-state marker (e.g. the Excluded view is currently on). */
  checked?: boolean;
  /** Render a divider above this item. */
  divider?: boolean;
  /** Grey out and ignore clicks (e.g. while the item's action runs). */
  disabled?: boolean;
  /** Secondary line under the label (e.g. the current source profile). */
  hint?: string;
  /** Drill-in choice list — replaces the menu body until Back/selection. */
  submenu?: MoreMenuChoice[];
}

/**
 * Header overflow menu — groups secondary toolbar controls (views,
 * pickers, setup entries) behind one compact trigger so wide toolbars
 * don't burn horizontal space. Trigger matches the outline toolbar
 * button look (see ColumnPicker). One drill-in level for choice lists;
 * anything richer (e.g. the Categories panel) should open its own
 * surface from a plain item instead.
 */
export function MoreMenu({
  label = "More",
  items,
}: {
  label?: string;
  items: MoreMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  // Index of the drilled-in item (submenu shown), or null for the root list.
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDrillIndex(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close() {
    setOpen(false);
    setDrillIndex(null);
  }

  const drilled = drillIndex !== null ? items[drillIndex] : null;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setDrillIndex(null);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
      >
        {label}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          role="menu"
          // Cap at ~70vh + scroll internally so a long menu (many grouped
          // actions / submenu items) never overruns the page bottom. Matches
          // ColumnPicker / EnrichMenu.
          className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] min-w-52 overflow-y-auto overscroll-contain rounded-lg py-1"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-moderate)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          {drilled?.submenu ? (
            <>
              <button
                type="button"
                onClick={() => setDrillIndex(null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <ChevronLeft size={13} />
                {drilled.label}
              </button>
              <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
              {drilled.submenu.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={!!choice.checked}
                  onClick={() => {
                    choice.onClick();
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {choice.checked && (
                    <Check size={13} style={{ color: "var(--color-accent)" }} />
                  )}
                </button>
              ))}
            </>
          ) : (
            items.map((item, i) => (
              <div key={item.label}>
                {item.divider && (
                  <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
                )}
                <button
                  type="button"
                  role="menuitem"
                  data-checked={item.checked || undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    if (item.submenu) {
                      setDrillIndex(i);
                      return;
                    }
                    item.onClick?.();
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <span className="shrink-0" style={{ color: "var(--color-text-tertiary)" }}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.hint && (
                      <span className="block truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {item.hint}
                      </span>
                    )}
                  </span>
                  {item.checked && <Check size={13} style={{ color: "var(--color-accent)" }} />}
                  {item.submenu && <ChevronRight size={13} style={{ color: "var(--color-text-tertiary)" }} />}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
