"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListFilter, Search, X, Check } from "lucide-react";

/**
 * Per-column header filter — the Notion / Excel "click the column to
 * filter" affordance. One of three kinds:
 *
 *   - "text"     → substring match on the cell value
 *   - "enum"     → multi-select over the distinct values present
 *   - "presence" → has a value / is empty
 *
 * Stateless about *which* rows match — it only emits a `ColumnFilterState`
 * and lets the table apply it. A `null`/empty state means "no constraint".
 */
export type ColumnFilterKind = "text" | "enum" | "presence";

/** An enum option whose stable wire value differs from its display label
 *  (e.g. the Phone filter sends the dial code "41" but shows "Suisse · +41").
 *  Plain `string` options remain supported — they use the value as the label. */
export interface ColumnFilterOption {
  value: string;
  label: string;
}

export interface ColumnFilterState {
  text?: string;
  values?: string[];
  presence?: "has" | "empty";
}

/** True when the state actually constrains anything. */
export function isColumnFilterActive(s: ColumnFilterState | undefined): boolean {
  if (!s) return false;
  return !!(s.text?.trim() || (s.values && s.values.length > 0) || s.presence);
}

export function ColumnFilter({
  label,
  kind,
  options = [],
  counts,
  state,
  onChange,
  open,
  onOpenChange,
}: {
  label: string;
  kind: ColumnFilterKind;
  /** Distinct values for an enum filter (already de-duped + sorted). Strings,
   *  or `{ value, label }` when the wire value differs from the display label. */
  options?: Array<string | ColumnFilterOption>;
  /** Per-value row counts (value → N) for an enum filter, shown as "(N)" next
   *  to each option so the user gets an order of magnitude before picking. */
  counts?: Record<string, number>;
  state: ColumnFilterState | undefined;
  onChange: (next: ColumnFilterState | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const active = isColumnFilterActive(state);
  const containerRef = useRef<HTMLDivElement>(null);
  const [optionQuery, setOptionQuery] = useState("");

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  // Normalize to { value, label } so plain-string and labelled options share
  // one render path. Memoized on the raw `options` reference.
  const normOptions = useMemo<ColumnFilterOption[]>(
    () => options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
    [options],
  );

  const filteredOptions = useMemo(() => {
    const q = optionQuery.trim().toLowerCase();
    if (!q) return normOptions;
    return normOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [normOptions, optionQuery]);

  const selected = useMemo(() => new Set(state?.values ?? []), [state?.values]);

  function toggleValue(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size > 0 ? { values: Array.from(next) } : undefined);
  }

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{
          color: active ? "var(--color-accent)" : "var(--color-text-muted)",
          opacity: active ? 1 : 0.55,
        }}
      >
        <ListFilter size={11} />
      </button>
      {active && (
        <span
          className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-accent)" }}
          aria-hidden="true"
        />
      )}

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-lg p-2"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-moderate)",
            boxShadow: "var(--shadow-floating)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
              Filter · {label}
            </span>
            {active && (
              <button
                type="button"
                onClick={() => { onChange(undefined); setOptionQuery(""); }}
                className="text-[10px] font-medium hover:underline"
                style={{ color: "var(--color-accent)" }}
              >
                Clear
              </button>
            )}
          </div>

          {kind === "text" && (
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2" style={{ color: "var(--color-text-muted)" }} />
              <input
                autoFocus
                value={state?.text ?? ""}
                onChange={(e) => onChange(e.target.value ? { text: e.target.value } : undefined)}
                placeholder={`Contains…`}
                className="h-7 w-full rounded-md pl-7 pr-2 text-[12px]"
                style={{
                  border: "1px solid var(--color-border-default)",
                  background: "var(--color-bg-page)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
          )}

          {kind === "presence" && (
            <div className="flex flex-col gap-0.5">
              {([
                { key: undefined, label: "Any" },
                { key: "has" as const, label: "Has a value" },
                { key: "empty" as const, label: "Is empty" },
              ]).map((opt) => {
                const isSel = (state?.presence ?? undefined) === opt.key;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => onChange(opt.key ? { presence: opt.key } : undefined)}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{ color: isSel ? "var(--color-accent)" : "var(--color-text-secondary)" }}
                  >
                    {opt.label}
                    {isSel && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          )}

          {kind === "enum" && (
            <>
              {normOptions.length > 8 && (
                <div className="relative mb-1.5 flex items-center">
                  <Search size={12} className="absolute left-2" style={{ color: "var(--color-text-muted)" }} />
                  <input
                    autoFocus
                    value={optionQuery}
                    onChange={(e) => setOptionQuery(e.target.value)}
                    placeholder="Search values…"
                    className="h-7 w-full rounded-md pl-7 pr-6 text-[12px]"
                    style={{
                      border: "1px solid var(--color-border-default)",
                      background: "var(--color-bg-page)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {optionQuery && (
                    <button
                      type="button"
                      onClick={() => setOptionQuery("")}
                      className="absolute right-1.5"
                      style={{ color: "var(--color-text-muted)" }}
                      aria-label="Clear value search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              <div className="max-h-56 overflow-auto">
                {filteredOptions.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    No values
                  </p>
                ) : (
                  filteredOptions.map((opt) => {
                    const isSel = selected.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleValue(opt.value)}
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
                        <span className="flex-1 truncate">{opt.label}</span>
                        {counts && counts[opt.value] != null && (
                          <span
                            className="shrink-0 tabular-nums text-[11px]"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            ({counts[opt.value].toLocaleString()})
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {selected.size > 0 && (
                <div className="mt-1.5 px-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {selected.size} selected
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
