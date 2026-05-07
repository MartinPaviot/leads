"use client";

/**
 * DealPropertyCell — render a deal property value with source
 * attribution tooltip (P0-5 task 5.6).
 *
 * Reads a field from `deals.properties` via the property accessor —
 * works against either the new PropertyEntry shape (post P0-5
 * migration) or legacy primitives (synthesised entry with manual:true,
 * source: "legacy", date: epoch).
 *
 * The tooltip shows : where the value came from (email/transcript/
 * manual), when, and the LLM confidence when present. Manual values
 * surface a "manual" badge so the user immediately sees the field is
 * pinned and won't be overwritten by autofill.
 */

import { useState } from "react";
import { Info, Mail, Mic, User, FileText, Database } from "lucide-react";
import { getDealPropertyEntry } from "@/lib/deal-autofill/property-accessor";

interface DealPropertyCellProps {
  /** The deal's `properties` jsonb — pass through from the page state. */
  properties: Record<string, unknown> | null | undefined;
  /** Property key, e.g. "budget", "team_size", "competitors". */
  fieldName: string;
  /** Human label shown above the value. */
  label: string;
  /** Custom value renderer — receives the raw extracted value, returns
   *  ReactNode. Falls back to String(value) when not provided. Useful
   *  for arrays (competitors) or money formatting. */
  formatValue?: (value: unknown) => React.ReactNode;
  /** Render when value is absent. Default "—". */
  emptyState?: React.ReactNode;
  /** Optional className passed to the cell wrapper. */
  className?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  email: "From email",
  transcript: "From meeting transcript",
  meeting: "From meeting notes",
  meeting_notes: "From meeting notes",
  manual: "Manual entry",
  user: "Manual entry",
  legacy: "Pre-autofill (unknown source)",
  import: "Imported",
};

const SOURCE_ICON: Record<string, typeof Mail> = {
  email: Mail,
  transcript: Mic,
  meeting: Mic,
  meeting_notes: Mic,
  manual: User,
  user: User,
  legacy: Database,
  import: FileText,
};

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "Unknown date";
  // "Apr 28, 2026" — short, scannable, locale-respecting.
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  let color = "var(--color-error)";
  let label = "Low";
  if (confidence >= 0.8) {
    color = "var(--color-success)";
    label = "High";
  } else if (confidence >= 0.5) {
    color = "var(--color-warning)";
    label = "Medium";
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      <span style={{ color }}>{label}</span>
      <span style={{ color: "var(--color-text-tertiary)" }}>
        ({Math.round(confidence * 100)}%)
      </span>
    </span>
  );
}

export function DealPropertyCell({
  properties,
  fieldName,
  label,
  formatValue,
  emptyState = "—",
  className = "",
}: DealPropertyCellProps) {
  const [hover, setHover] = useState(false);

  const entry = getDealPropertyEntry(properties, fieldName);

  if (!entry || entry.value == null || entry.value === "") {
    return (
      <div className={className}>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-0.5">
          {label}
        </p>
        <p className="text-sm text-[var(--color-text-tertiary)]">{emptyState}</p>
      </div>
    );
  }

  const sourceKey = entry.source || "legacy";
  const SourceIcon = SOURCE_ICON[sourceKey] || Database;
  const sourceLabel = SOURCE_LABEL[sourceKey] || sourceKey;
  const formattedDate = formatDate(entry.date);
  const renderedValue = formatValue
    ? formatValue(entry.value)
    : Array.isArray(entry.value)
      ? entry.value.join(", ")
      : String(entry.value);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
    >
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-0.5 flex items-center gap-1">
        {label}
        <Info
          size={10}
          aria-label="Field source attribution"
          style={{
            color: "var(--color-text-tertiary)",
            opacity: hover ? 1 : 0.55,
            transition: "opacity 120ms",
          }}
        />
      </p>
      <p className="text-sm text-[var(--color-text-primary)] flex items-center gap-2">
        <span className="truncate">{renderedValue}</span>
        {entry.manual && (
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
            title="Manually entered — autofill will not overwrite"
          >
            manual
          </span>
        )}
      </p>

      {hover && (
        <div
          role="tooltip"
          className="absolute z-30 mt-1 w-64 rounded-md p-3 text-[11px] shadow-lg"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <SourceIcon size={12} style={{ color: "var(--color-accent)" }} />
            <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {sourceLabel}
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span style={{ color: "var(--color-text-tertiary)" }}>Captured</span>
              <span>{formattedDate}</span>
            </div>
            {entry.confidence !== undefined && (
              <div className="flex justify-between">
                <span style={{ color: "var(--color-text-tertiary)" }}>Confidence</span>
                <ConfidenceDot confidence={entry.confidence} />
              </div>
            )}
            <div className="flex justify-between">
              <span style={{ color: "var(--color-text-tertiary)" }}>Locked</span>
              <span>{entry.manual ? "Yes (manual)" : "No (autofill)"}</span>
            </div>
          </div>
          {!entry.manual && (
            <p
              className="mt-2 pt-2 text-[10px]"
              style={{
                color: "var(--color-text-tertiary)",
                borderTop: "1px solid var(--color-border-default)",
              }}
            >
              Edit this field to pin it manually.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
