"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VirtualTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, rowIndex: number) => ReactNode;
  width?: number;
  sortable?: boolean;
  pinned?: "left" | "right";
}

/**
 * Virtualized table for 1k+ rows. Renders only the rows currently in
 * the viewport + a small buffer, so scroll stays smooth even on 50k
 * accounts.
 *
 * Column sums to at most one sticky-left + one sticky-right pinned
 * column — keeping the implementation narrow on purpose. Callers that
 * need richer column behavior (drag reorder, resize handles) can add
 * it in a wrapper.
 */
export function VirtualTable<T>({
  items,
  columns,
  rowHeight = 48,
  onRowClick,
  loadingRows = 0,
  stickyHeader = true,
  emptyState,
  className = "",
  rowKey,
}: {
  items: T[];
  columns: VirtualTableColumn<T>[];
  rowHeight?: number;
  onRowClick?: (row: T, index: number) => void;
  /** When `items.length === 0` and `loadingRows > 0`, render this
   *  many empty skeleton rows instead of the empty state. */
  loadingRows?: number;
  stickyHeader?: boolean;
  emptyState?: ReactNode;
  className?: string;
  /** Extract a stable key per row. Defaults to `index`. Prefer an
   *  explicit id when rows can reorder. */
  rowKey?: (row: T, index: number) => string | number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });

  const totalWidth = columns.reduce((sum, c) => sum + (c.width ?? 160), 0);

  if (items.length === 0 && loadingRows === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const showingSkeletons = items.length === 0 && loadingRows > 0;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto ${className}`.trim()}
      style={{ maxHeight: "100%" }}
    >
      {stickyHeader && (
        <div
          role="row"
          className="sticky top-0 z-10 flex"
          style={{
            minWidth: totalWidth,
            background: "var(--color-bg-card)",
            borderBottom: "1px solid var(--color-border-default)",
          }}
        >
          {columns.map((c) => (
            <div
              key={c.key}
              role="columnheader"
              className="flex items-center px-3 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                width: c.width ?? 160,
                height: rowHeight,
                color: "var(--color-text-muted)",
                ...pinStyle(c),
              }}
            >
              {c.header}
            </div>
          ))}
        </div>
      )}

      {showingSkeletons ? (
        <div>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              role="row"
              aria-busy="true"
              className="flex"
              style={{ height: rowHeight, minWidth: totalWidth }}
            >
              {columns.map((c) => (
                <div key={c.key} className="flex items-center px-3"
                  style={{ width: c.width ?? 160 }}>
                  <div
                    className="h-3 w-3/4 rounded"
                    style={{ background: "var(--color-bg-hover)" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: totalWidth,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = items[virtualRow.index];
            const key = rowKey ? rowKey(row, virtualRow.index) : virtualRow.index;
            return (
              <div
                key={key}
                role="row"
                onClick={onRowClick ? () => onRowClick(row, virtualRow.index) : undefined}
                className="absolute left-0 top-0 flex"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: rowHeight,
                  width: "100%",
                  minWidth: totalWidth,
                  cursor: onRowClick ? "pointer" : undefined,
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className="flex items-center px-3 text-[13px]"
                    style={{
                      width: c.width ?? 160,
                      color: "var(--color-text-primary)",
                      ...pinStyle(c),
                    }}
                  >
                    {c.render(row, virtualRow.index)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pinStyle<T>(c: VirtualTableColumn<T>): CSSProperties {
  if (c.pinned === "left") {
    return { position: "sticky", left: 0, background: "var(--color-bg-card)", zIndex: 5 };
  }
  if (c.pinned === "right") {
    return { position: "sticky", right: 0, background: "var(--color-bg-card)", zIndex: 5 };
  }
  return {};
}
