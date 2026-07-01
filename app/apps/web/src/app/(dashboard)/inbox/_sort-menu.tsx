"use client";

/**
 * Inbox sort control (Upstream/Outlook parity) — a small header button that
 * opens a radio menu of sort modes. The active mode carries a check; selecting
 * one closes the menu and bubbles up so the page can persist + refetch. Styling
 * mirrors the density toggle (h-7 w-7 bordered button, Elevay tokens, no raw
 * palette) so the inbox header stays at the 44px --header-height standard.
 */

import { useState, useRef, useEffect } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { INBOX_SORTS, type InboxSort } from "@/lib/inbox/inbox-sort";

export function SortMenu({ value, onChange }: { value: InboxSort; onChange: (s: InboxSort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-secondary)" }}
        title="Sort conversations"
        aria-label="Sort conversations"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowUpDown size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg py-1"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-floating)" }}
        >
          <div
            className="px-3 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Sort by
          </div>
          {INBOX_SORTS.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={s.id === value}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: "var(--color-text-primary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Check size={14} style={{ opacity: s.id === value ? 1 : 0, color: "var(--color-accent)" }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
