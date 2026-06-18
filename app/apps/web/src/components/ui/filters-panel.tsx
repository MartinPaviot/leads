"use client";

import { useEffect } from "react";
import { SlidersHorizontal, X, Check } from "lucide-react";
import type { ColumnFilterState } from "./column-filter";

/**
 * Dedicated "Filters" panel — a right-side drawer that houses the filters that
 * have no natural column header to hang on (seniority, recency, source, owner…).
 * It is just another surface over the SAME `columnFilters` state the column
 * headers and the serializer already use, so debounce / select-all / the active
 * count all keep working unchanged — adding a filter is one entry here plus its
 * server param.
 *
 * Each filter is an enum multi-select. Options may be plain strings or
 * `{ value, label }` when the wire value differs from the display label
 * (e.g. seniority sends "c_suite", shows "Direction (C-level)").
 */

export interface PanelFilterOption {
  value: string;
  label: string;
}

export interface PanelFilterDef {
  /** Matches the key used in `columnFilters` + the serializer. */
  key: string;
  label: string;
  options: Array<string | PanelFilterOption>;
  /** Per-value row counts (value → N), shown as "(N)". */
  counts?: Record<string, number>;
  /** Optional one-line hint under the label. */
  hint?: string;
}

export interface PanelSection {
  title: string;
  filters: PanelFilterDef[];
}

function normalize(opts: Array<string | PanelFilterOption>): PanelFilterOption[] {
  return opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

/** Count of panel filters that currently constrain the list. */
export function panelActiveCount(
  sections: PanelSection[],
  state: Record<string, ColumnFilterState>,
): number {
  const keys = new Set(sections.flatMap((s) => s.filters.map((f) => f.key)));
  let n = 0;
  for (const k of keys) if ((state[k]?.values?.length ?? 0) > 0) n++;
  return n;
}

export function FiltersPanel({
  open,
  onOpenChange,
  sections,
  state,
  onChange,
  title = "Filtres",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PanelSection[];
  state: Record<string, ColumnFilterState>;
  onChange: (key: string, next: ColumnFilterState | undefined) => void;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const allKeys = sections.flatMap((s) => s.filters.map((f) => f.key));
  const activeCount = allKeys.filter((k) => (state[k]?.values?.length ?? 0) > 0).length;

  function toggle(key: string, value: string) {
    const cur = new Set(state[key]?.values ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    onChange(key, cur.size > 0 ? { values: [...cur] } : undefined);
  }
  function clearAll() {
    for (const k of allKeys) onChange(k, undefined);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.25)" }}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col animate-content-in"
        style={{
          background: "var(--color-bg-card)",
          borderLeft: "1px solid var(--color-border-moderate)",
          boxShadow: "var(--shadow-floating)",
        }}
        role="dialog"
        aria-label={title}
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            <SlidersHorizontal size={14} style={{ opacity: 0.6 }} />
            {title}
            {activeCount > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                {activeCount}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-medium hover:underline"
                style={{ color: "var(--color-accent)" }}
              >
                Tout effacer
              </button>
            )}
            <button
              type="button"
              aria-label="Fermer les filtres"
              onClick={() => onOpenChange(false)}
              className="rounded p-1 transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3">
          {sections.map((section) => (
            <section key={section.title} className="mb-4">
              <h4
                className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {section.title}
              </h4>
              {section.filters.map((f) => {
                const opts = normalize(f.options);
                const sel = new Set(state[f.key]?.values ?? []);
                return (
                  <div key={f.key} className="mb-3">
                    <div className="mb-1 flex items-baseline justify-between px-0.5">
                      <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                        {f.label}
                      </span>
                      {sel.size > 0 && (
                        <button
                          type="button"
                          onClick={() => onChange(f.key, undefined)}
                          className="text-[10px] hover:underline"
                          style={{ color: "var(--color-accent)" }}
                        >
                          effacer
                        </button>
                      )}
                    </div>
                    {f.hint && (
                      <p className="mb-1 px-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {f.hint}
                      </p>
                    )}
                    {opts.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>
                        Aucune valeur
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {opts.map((o) => {
                          const isSel = sel.has(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => toggle(f.key, o.value)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              <span
                                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px]"
                                style={{
                                  border: `1px solid ${isSel ? "var(--color-accent)" : "var(--color-border-moderate)"}`,
                                  background: isSel ? "var(--color-accent)" : "transparent",
                                }}
                              >
                                {isSel && <Check size={10} color="#fff" />}
                              </span>
                              <span className="flex-1 truncate">{o.label}</span>
                              {f.counts && f.counts[o.value] != null && (
                                <span className="shrink-0 tabular-nums text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                                  ({f.counts[o.value].toLocaleString()})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
