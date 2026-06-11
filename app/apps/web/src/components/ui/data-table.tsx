"use client";

import { useState, useMemo } from "react";
import { Checkbox } from "./input";
import { TableSkeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  hideBelow?: number; // hide column below this viewport width
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  getRowId: (row: T) => string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  stickyHeader?: boolean;
}

type SortDir = "asc" | "desc";

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyIcon,
  emptyTitle = "No data",
  emptyDescription,
  onRowClick,
  getRowId,
  selectable,
  selectedIds,
  onSelectionChange,
  stickyHeader = true,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;
    return [...data].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? "");
      const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  const allSelected = selectable && data.length > 0 && selectedIds?.size === data.length;

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(getRowId)));
    }
  }

  function toggleRow(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  if (loading) return <TableSkeleton rows={8} cols={columns.length} />;

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon || <span className="text-2xl">-</span>}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table
        className="ls-table"
        data-selecting={selectable && (selectedIds?.size ?? 0) > 0 ? "true" : undefined}
      >
        <thead>
          <tr>
            {selectable && (
              <th className="check" style={{ width: 40, padding: "8px" }}>
                <Checkbox checked={!!allSelected} onChange={toggleAll} />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                data-sorted={sortKey === col.key ? sortDir : undefined}
                style={{
                  width: col.width,
                  cursor: col.sortable ? "pointer" : "default",
                  ...(stickyHeader ? { position: "sticky", top: 0 } : {}),
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => {
            const id = getRowId(row);
            const selected = selectedIds?.has(id);
            return (
              <tr
                key={id}
                data-selected={selected ? "true" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{ cursor: onRowClick ? "pointer" : undefined }}
              >
                {selectable && (
                  <td className="check" style={{ width: 40, padding: "0 8px" }} onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={!!selected} onChange={() => toggleRow(id)} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={{ width: col.width }}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
