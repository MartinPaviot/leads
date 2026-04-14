"use client";

import type { ReactNode, CSSProperties } from "react";

/**
 * Layout primitive that swaps between horizontal and vertical stacking
 * via Tailwind classes — no state, no JS. At `breakpoint` and up the
 * children lay out horizontally; below it, vertically.
 *
 * Use for two-column layouts that collapse to stacked cards on mobile
 * (e.g. form sections, stats rows, detail panels + main pane).
 */
const DIRECTION_BELOW: Record<"row" | "column", string> = {
  row: "flex flex-col",
  column: "flex flex-row",
};

const DIRECTION_AT: Record<"row" | "column", Record<string, string>> = {
  row: {
    sm: "sm:flex-row",
    md: "md:flex-row",
    lg: "lg:flex-row",
    xl: "xl:flex-row",
  },
  column: {
    sm: "sm:flex-col",
    md: "md:flex-col",
    lg: "lg:flex-col",
    xl: "xl:flex-col",
  },
};

export function ResponsiveStack({
  children,
  at = "md",
  above = "row",
  gap = 16,
  className = "",
  style,
}: {
  children: ReactNode;
  /** Breakpoint at and above which `above` direction applies. */
  at?: "sm" | "md" | "lg" | "xl";
  /** Layout at/above `at`. Default `row` (below = column). */
  above?: "row" | "column";
  /** Gap in px; applied as inline style for flexibility. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const baseDir = DIRECTION_BELOW[above];
  const aboveDir = DIRECTION_AT[above][at];
  return (
    <div
      className={`${baseDir} ${aboveDir} ${className}`.trim()}
      style={{ gap, ...style }}
    >
      {children}
    </div>
  );
}
