"use client";

import { useEffect } from "react";

/**
 * Defensive guard for auth pages. The marketing page and modal
 * components both set `body.style.overflow = "hidden"` while open and
 * restore it on cleanup. In dev (React Strict Mode double-invoke) and
 * in some client-navigation races, the cleanup can capture a stale
 * `prevOverflow = "hidden"` and re-apply it, leaking a scroll lock to
 * subsequent pages.
 *
 * Auth pages are full-screen, never need a scroll lock, and any prior
 * lock from another page is by definition stale here. Force-release on
 * mount.
 */
export function BodyScrollUnlock() {
  useEffect(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }, []);
  return null;
}
