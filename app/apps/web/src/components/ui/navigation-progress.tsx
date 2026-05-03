"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (completionRef.current) { clearTimeout(completionRef.current); completionRef.current = null; }
  }, []);

  const start = useCallback(() => {
    cleanup();
    setProgress(0);
    setVisible(true);
    requestAnimationFrame(() => setProgress(20));
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + (90 - p) * 0.08;
      });
    }, 300);
  }, [cleanup]);

  const done = useCallback(() => {
    cleanup();
    setProgress(100);
    completionRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
  }, [cleanup]);

  // Intercept all link clicks to START the progress bar immediately.
  // This fires BEFORE navigation begins — the key insight the previous
  // implementation missed.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      const hrefPath = href.split("?")[0].split("#")[0];
      if (hrefPath === pathname) return;
      start();
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, start]);

  // Complete the bar when the route actually changes (page loaded).
  useEffect(() => {
    if (visible) done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[9999]"
      style={{ top: 0, height: 2, pointerEvents: "none" }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "var(--color-accent)",
          transition:
            progress === 0
              ? "none"
              : progress === 100
                ? "width 150ms ease-out, opacity 200ms 50ms ease-out"
                : "width 500ms cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: progress === 100 ? 0 : 1,
          boxShadow: "0 0 6px color-mix(in srgb, var(--color-accent) 50%, transparent)",
        }}
      />
    </div>
  );
}
