"use client";

import { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  function show() {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }

  function hide() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }

  return (
    <div className="relative inline-flex" ref={ref} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px]"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg-page)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className="absolute left-1/2 top-full -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid var(--color-text-primary)",
            }}
          />
        </div>
      )}
    </div>
  );
}
