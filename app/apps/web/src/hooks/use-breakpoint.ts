"use client";

import { useEffect, useState } from "react";

/** Tailwind v4 default breakpoints, in px. Keep in sync if theme overrides them. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/** Pure helper: which key matches `width`? Exported for tests. */
export function breakpointFor(width: number): BreakpointKey | "base" {
  if (width >= BREAKPOINTS["2xl"]) return "2xl";
  if (width >= BREAKPOINTS.xl) return "xl";
  if (width >= BREAKPOINTS.lg) return "lg";
  if (width >= BREAKPOINTS.md) return "md";
  if (width >= BREAKPOINTS.sm) return "sm";
  return "base";
}

/**
 * SSR-safe breakpoint watcher. Returns "base" on the server and during
 * the first client render; subsequent renders reflect actual width.
 *
 * Callers should branch on >= comparisons via the exported
 * `isAtLeast(current, target)` helper rather than direct equality, so
 * larger breakpoints still pick up md-specific behavior.
 */
export function useBreakpoint(): BreakpointKey | "base" {
  const [bp, setBp] = useState<BreakpointKey | "base">("base");

  useEffect(() => {
    if (typeof window === "undefined") return;
    function update() {
      setBp(breakpointFor(window.innerWidth));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return bp;
}

const ORDER: Array<BreakpointKey | "base"> = ["base", "sm", "md", "lg", "xl", "2xl"];

/** True if `current` is at or above `target` breakpoint. */
export function isAtLeast(
  current: BreakpointKey | "base",
  target: BreakpointKey | "base"
): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}
