"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Building2, Users, CircleDot, CheckSquare, FileText, MessageSquare, Settings, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  section: string;
}

const NAV_ITEMS: CommandItem[] = [
  { id: "dashboard", label: "Up next", icon: <Search size={16} />, href: "/", section: "Navigation" },
  { id: "accounts", label: "Accounts", icon: <Building2 size={16} />, href: "/accounts", section: "Navigation" },
  { id: "contacts", label: "Contacts", icon: <Users size={16} />, href: "/contacts", section: "Navigation" },
  { id: "opportunities", label: "Opportunities", icon: <CircleDot size={16} />, href: "/opportunities", section: "Navigation" },
  { id: "sequences", label: "Sequences", icon: <Zap size={16} />, href: "/sequences", section: "Navigation" },
  { id: "tasks", label: "Tasks", icon: <CheckSquare size={16} />, href: "/tasks", section: "Navigation" },
  { id: "notes", label: "Notes", icon: <FileText size={16} />, href: "/notes", section: "Navigation" },
  { id: "chat", label: "Ask LeadSens", icon: <MessageSquare size={16} />, href: "/chat", section: "Navigation" },
  { id: "settings", label: "Settings", icon: <Settings size={16} />, href: "/settings", section: "Navigation" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        const item = filtered[selectedIndex];
        if (item.href) router.push(item.href);
        if (item.action) item.action();
        setOpen(false);
      }
    },
    [open, filtered, selectedIndex, router]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0"
        style={{ background: "var(--color-bg-modal-overlay)" }}
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
          animation: "modal-fade-in 150ms ease-out",
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          <Search size={16} style={{ color: "var(--color-text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search or jump to..."
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
          <kbd
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
              No results found
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.href) router.push(item.href);
                  if (item.action) item.action();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                style={{
                  color: "var(--color-text-primary)",
                  background: i === selectedIndex ? "var(--color-bg-hover)" : "transparent",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span style={{ color: "var(--color-text-tertiary)" }}>{item.icon}</span>
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
