"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";

interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  divider?: boolean;
}

interface DropdownMenuProps {
  items: DropdownItem[];
  trigger?: React.ReactNode;
  align?: "left" | "right";
}

export function DropdownMenu({ items, trigger, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
        style={{ color: "var(--color-text-tertiary)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {trigger || <MoreHorizontal size={16} />}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 min-w-[160px] rounded-lg py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.divider && (
                <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors"
                style={{
                  color: item.destructive ? "var(--color-error)" : "var(--color-text-primary)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
