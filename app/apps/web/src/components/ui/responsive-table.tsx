"use client";

import type { ReactNode } from "react";
import { isAtLeast, useBreakpoint } from "@/hooks/use-breakpoint";

export interface ResponsiveColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Show this column at `at` breakpoint and up. Default `base`
   *  (always visible). Useful for de-prioritising secondary columns
   *  on small screens. */
  at?: "base" | "sm" | "md" | "lg" | "xl";
  /** When rendering cards on small screens, this column becomes the
   *  card title. At most one column per table should set this. */
  primary?: boolean;
}

/**
 * At `md+` renders a standard table. Below `md`, renders each row as a
 * stacked card with the primary column as title and the remaining
 * columns as label/value pairs. Keeps the same data shape so migration
 * is a one-line swap at the call site.
 */
export function ResponsiveTable<T extends { id: string }>({
  items,
  columns,
  onRowClick,
  emptyState,
  tableClassName = "",
}: {
  items: T[];
  columns: ResponsiveColumn<T>[];
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  tableClassName?: string;
}) {
  const bp = useBreakpoint();
  const isWide = isAtLeast(bp, "md");

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  if (isWide) {
    const visible = columns.filter((c) => isAtLeast(bp, c.at ?? "base"));
    return (
      <table className={`w-full ${tableClassName}`.trim()}>
        <thead>
          <tr>
            {visible.map((c) => (
              <th key={c.key} className="text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : undefined }}
            >
              {visible.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Card layout for mobile / narrow viewports.
  const primary = columns.find((c) => c.primary);
  const secondaries = columns.filter((c) => !c.primary);

  return (
    <div className="flex flex-col gap-2">
      {items.map((row) => (
        <div
          key={row.id}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className="rounded-lg px-3 py-2.5"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            cursor: onRowClick ? "pointer" : undefined,
          }}
        >
          {primary && (
            <div className="mb-1 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {primary.render(row)}
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
            {secondaries.map((c) => (
              <div key={c.key} className="contents">
                <dt style={{ color: "var(--color-text-muted)" }}>{c.header}</dt>
                <dd style={{ color: "var(--color-text-secondary)" }}>{c.render(row)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
