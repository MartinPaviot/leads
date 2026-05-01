"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    cleanup();

    setProgress(0);
    setVisible(true);

    requestAnimationFrame(() => {
      setProgress(30);
    });

    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + (90 - p) * 0.1;
      });
    }, 200);

    timerRef.current = setTimeout(() => {
      cleanup();
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 150);

    return cleanup;
  }, [pathname, cleanup]);

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
                ? "width 150ms ease-out, opacity 300ms ease-out"
                : "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: progress === 100 ? 0 : 1,
          boxShadow: "0 0 8px var(--color-accent)",
        }}
      />
    </div>
  );
}
