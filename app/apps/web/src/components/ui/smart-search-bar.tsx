"use client";

/**
 * SmartSearchBar — natural-language input that calls /api/filters/parse-nl
 * and hands the extracted FilterCondition[] back to the parent via
 * onFilters. The parent decides what to do with them (apply client-side,
 * push to URL, etc.).
 *
 * Inspired by FuseAI's "Smart Search" pill on Prospect Search. Difference
 * of philosophy: we map to our existing, typed FilterCondition model and
 * show the user exactly what was extracted (as removable chips) so they
 * can correct a mistranslation — Fuse's version silently applied "SaaS"
 * as a Job Title Keyword when the user meant Company Industry, and we
 * saw real user-visible precision drop to ~35% because of it.
 *
 * Keep this component dumb: it does one thing (parse a query), reports
 * the result. It does not own the applied-filter state.
 */

import React, { useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import type { FilterCondition } from "@/lib/search/filters";

export interface SmartSearchBarProps {
  resourceType: "account" | "contact";
  onFilters: (filters: FilterCondition[], meta: { reasoning: string; unmatched: string[] }) => void;
  onError?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Controlled value (optional). If provided, use `onChange` too. */
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function SmartSearchBar({
  resourceType,
  onFilters,
  onError,
  placeholder,
  disabled,
  value: controlledValue,
  onChange: controlledOnChange,
  className = "",
}: SmartSearchBarProps) {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const setValue = controlledOnChange ?? setInternalValue;

  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const query = value.trim();
    if (!query || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/filters/parse-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, resourceType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(data?.error || `Parse failed (${res.status})`);
        return;
      }
      const filters = (data?.filters as FilterCondition[] | undefined) ?? [];
      onFilters(filters, {
        reasoning: String(data?.reasoning ?? ""),
        unmatched: Array.isArray(data?.unmatched) ? data.unmatched : [],
      });
    } catch (e) {
      onError?.(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search
        size={13}
        aria-hidden="true"
        className="absolute left-2.5"
        style={{ color: submitting ? "var(--color-text-muted)" : "var(--color-accent)" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={
          placeholder ??
          (resourceType === "account"
            ? "Smart search — e.g. SaaS in France with high fit score"
            : "Smart search — e.g. CTOs at fintech companies")
        }
        disabled={disabled || submitting}
        aria-label="Smart search"
        aria-busy={submitting}
        className="h-7 w-full rounded-md border pl-8 pr-8 text-[12px] outline-none transition-colors focus:ring-1"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-bg-input)",
          color: "var(--color-text-primary)",
        }}
      />
      {submitting && (
        <Loader2
          size={12}
          className="absolute right-2 animate-spin"
          style={{ color: "var(--color-text-muted)" }}
          aria-hidden="true"
        />
      )}
      {!submitting && value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear smart search"
          className="absolute right-2"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * ActiveFiltersChips — shows applied smart-filter conditions as
 * removable chips. Keeps the user in control : if the LLM misread a
 * clause they can drop it with one click. Parent owns the state.
 */
export function ActiveFiltersChips({
  filters,
  onRemove,
  onClear,
  reasoning,
  unmatched,
  fieldLabels,
}: {
  filters: FilterCondition[];
  onRemove: (index: number) => void;
  onClear: () => void;
  reasoning?: string;
  unmatched?: string[];
  /** Map of field key → display label, e.g. { industry: "Industry" }. Optional. */
  fieldLabels?: Record<string, string>;
}) {
  if (filters.length === 0 && (!unmatched || unmatched.length === 0)) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-5 py-2 text-[11px]"
      style={{ background: "var(--color-bg-page-alt, var(--color-bg-page))" }}
    >
      {filters.length > 0 && (
        <>
          <span style={{ color: "var(--color-text-tertiary)" }}>Smart filters:</span>
          {filters.map((f, i) => (
            <span
              key={`${f.field}-${f.operator}-${i}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              <span className="font-medium">
                {fieldLabels?.[f.field] ?? f.field}
              </span>
              <span style={{ color: "var(--color-text-tertiary)" }}>{prettyOp(f.operator)}</span>
              <span>{formatValue(f.value)}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${f.field} filter`}
                className="ml-0.5 opacity-70 hover:opacity-100"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="ml-1 underline"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Clear all
          </button>
        </>
      )}
      {unmatched && unmatched.length > 0 && (
        <span
          className="ml-auto italic"
          style={{ color: "var(--color-text-tertiary)" }}
          title={reasoning}
        >
          Couldn&apos;t map: {unmatched.join(", ")}
        </span>
      )}
    </div>
  );
}

function prettyOp(op: FilterCondition["operator"]): string {
  switch (op) {
    case "contains": return "contains";
    case "not-contains": return "not contains";
    case "starts-with": return "starts with";
    case "ends-with": return "ends with";
    case "eq": return "=";
    case "neq": return "≠";
    case "gt": return ">";
    case "gte": return "≥";
    case "lt": return "<";
    case "lte": return "≤";
    case "includes-any": return "any of";
    case "includes-all": return "all of";
    case "excludes": return "not";
    case "before": return "before";
    case "after": return "after";
    case "between": return "between";
    case "last-n-days": return "last N days";
    case "is-true": return "is true";
    case "is-false": return "is false";
    default: return op;
  }
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "—";
  return String(v);
}
