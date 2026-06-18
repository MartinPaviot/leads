"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wraps the marketing tree so its components use the lightweight `m.*`
 * components instead of `motion.*`.
 *
 * `domAnimation` (~17kb) vs the full `motion` bundle (~34kb) covers everything
 * the landing uses — animations, variants, exit animations (AnimatePresence),
 * and hover/tap gestures — but NOT drag or layout animations, which the landing
 * doesn't use. `strict` makes any stray `motion.*` throw, so we can't silently
 * reintroduce the heavy bundle.
 */
export function LazyMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
