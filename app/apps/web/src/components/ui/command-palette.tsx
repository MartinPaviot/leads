"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Building2,
  Users,
  CircleDot,
  CheckSquare,
  FileText,
  MessageSquare,
  Settings,
  Zap,
  Clock,
  Calendar,
  Briefcase,
  Inbox,
  Phone,
  Plus,
  ArrowRight,
  Mail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CompanyLogo } from "@/components/ui/company-logo";

/* ── Types ── */

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  section: string;
  meta?: string;
  domain?: string;
  companyName?: string;
}

interface SearchResult {
  id: string;
  name: string;
  type: "account" | "contact" | "opportunity" | "task" | "note" | "chat";
  meta?: string;
  domain?: string;
}

interface SearchResults {
  accounts: SearchResult[];
  contacts: SearchResult[];
  opportunities: SearchResult[];
  tasks: SearchResult[];
  notes: SearchResult[];
  chats: SearchResult[];
}

/* ── Static items ── */

// Keep this list in sync with the real product navigation (the sidebar's
// `navSections` in components/sidebar.tsx) — it is the source of truth for what
// counts as a destination. Pages that exist only by URL (deliverability,
// reports, tasks, insights, notes, voice-of-customer, knowledge, skills) are
// intentionally NOT offered here: surfacing them as "tabs" confused users into
// thinking removed sections still existed.
const NAV_ITEMS: CommandItem[] = [
  { id: "nav-home", label: "Up next", icon: <Clock size={16} />, href: "/", section: "Navigate to" },
  { id: "nav-accounts", label: "Accounts", icon: <Building2 size={16} />, href: "/accounts", section: "Navigate to" },
  { id: "nav-contacts", label: "Contacts", icon: <Users size={16} />, href: "/contacts", section: "Navigate to" },
  { id: "nav-opportunities", label: "Opportunities", icon: <CircleDot size={16} />, href: "/opportunities", section: "Navigate to" },
  { id: "nav-proposals", label: "Proposals", icon: <Briefcase size={16} />, href: "/proposals", section: "Navigate to" },
  { id: "nav-inbox", label: "Inbox", icon: <Inbox size={16} />, href: "/inbox", section: "Navigate to" },
  { id: "nav-call-mode", label: "Call Mode", icon: <Phone size={16} />, href: "/call-mode", section: "Navigate to" },
  { id: "nav-campaigns", label: "Campaigns", icon: <Zap size={16} />, href: "/sequences", section: "Navigate to" },
  { id: "nav-meetings", label: "Meetings", icon: <Calendar size={16} />, href: "/meetings", section: "Navigate to" },
  { id: "nav-chat", label: "Ask Orion", icon: <MessageSquare size={16} />, href: "/chat", section: "Navigate to" },
  { id: "nav-settings", label: "Settings", icon: <Settings size={16} />, href: "/settings", section: "Navigate to" },
];

// Only entities with a real create modal that honours `?create=true` (wired in
// each page). Tasks (deprecated tab) and sequences/campaigns (no create modal —
// built via the agent) are intentionally absent.
const ACTION_ITEMS: CommandItem[] = [
  { id: "act-new-chat", label: "New chat", icon: <Plus size={16} />, href: "/chat", section: "Actions" },
  { id: "act-new-account", label: "Create account", icon: <Building2 size={16} />, href: "/accounts?create=true", section: "Actions" },
  { id: "act-new-contact", label: "Create contact", icon: <Users size={16} />, href: "/contacts?create=true", section: "Actions" },
  { id: "act-new-deal", label: "Create opportunity", icon: <CircleDot size={16} />, href: "/opportunities?create=true", section: "Actions" },
];

/* ── Icon by record type ── */

const TYPE_ICON: Record<string, React.ReactNode> = {
  account: <Building2 size={16} />,
  contact: <Users size={16} />,
  opportunity: <CircleDot size={16} />,
  task: <CheckSquare size={16} />,
  note: <FileText size={16} />,
  chat: <MessageSquare size={16} />,
};

const TYPE_HREF: Record<string, (id: string) => string> = {
  account: (id) => `/accounts/${id}`,
  contact: (id) => `/contacts/${id}`,
  opportunity: (id) => `/opportunities/${id}`,
  task: (id) => `/tasks`,
  note: (id) => `/notes`,
  chat: (id) => `/chat?thread=${id}`,
};

const TYPE_LABELS: Record<string, string> = {
  accounts: "Accounts",
  contacts: "Contacts",
  opportunities: "Opportunities",
  tasks: "Tasks",
  notes: "Notes",
  chats: "Chats",
};

/* ── Component ── */

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Build the flat list of all visible items
  const buildItems = useCallback((): CommandItem[] => {
    const items: CommandItem[] = [];

    if (!query) {
      // No query: show nav + actions
      items.push(...NAV_ITEMS, ...ACTION_ITEMS);
    } else {
      // Filter nav items
      const filteredNav = NAV_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      );
      if (filteredNav.length > 0) items.push(...filteredNav);

      // Filter action items
      const filteredActions = ACTION_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      );
      if (filteredActions.length > 0) items.push(...filteredActions);

      // Add search results as items
      if (searchResults) {
        for (const [key, results] of Object.entries(searchResults)) {
          const label = TYPE_LABELS[key];
          if (!label || !results || results.length === 0) continue;
          for (const r of results as SearchResult[]) {
            items.push({
              id: `search-${r.type}-${r.id}`,
              label: r.name || "Untitled",
              icon: TYPE_ICON[r.type] || <Search size={16} />,
              href: TYPE_HREF[r.type]?.(r.id),
              section: `${label} (${(results as SearchResult[]).length})`,
              meta: r.meta,
              domain: r.domain,
              companyName: r.name || "Untitled",
            });
          }
        }
      }
    }

    return items;
  }, [query, searchResults]);

  const items = buildItems();

  // Group items by section for rendering
  const sections = items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);

      try {
        const res = await fetch(`/api/search/quick?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch {
        // aborted or failed
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Open/close handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && items[selectedIndex]) {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item.href) router.push(item.href);
        if (item.action) item.action();
        setOpen(false);
      }
    },
    [open, items, selectedIndex, router]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setSearchResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Allow external open via custom event
  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener("elevay:command-palette", handleOpen);
    return () => window.removeEventListener("elevay:command-palette", handleOpen);
  }, []);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
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
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <Search size={16} style={{ color: "var(--color-text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search or jump to..."
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--color-text-tertiary)]"
            style={{ color: "var(--color-text-primary)" }}
          />
          {searching && (
            <div
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: "var(--color-text-tertiary)" }}
            />
          )}
          <kbd
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--color-bg-hover)",
              color: "var(--color-text-tertiary)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results grouped by section */}
        <div ref={listRef} className="max-h-80 overflow-auto py-1">
          {items.length === 0 ? (
            <p
              className="px-4 py-8 text-center text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No results found
            </p>
          ) : (
            Object.entries(sections).map(([section, sectionItems]) => (
              <div key={section}>
                <div
                  className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {section}
                </div>
                {sectionItems.map((item) => {
                  flatIdx++;
                  const idx = flatIdx;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      onClick={() => {
                        if (item.href) router.push(item.href);
                        if (item.action) item.action();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                      style={{
                        color: "var(--color-text-primary)",
                        background: isSelected
                          ? "var(--color-bg-hover)"
                          : "transparent",
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {item.domain ? (
                        <CompanyLogo domain={item.domain} name={item.companyName || item.label} size={20} />
                      ) : (
                        <span className="flex shrink-0 items-center justify-center" style={{ color: "var(--color-text-tertiary)" }}>{item.icon}</span>
                      )}
                      <span className="flex-1 truncate text-left">
                        {item.label}
                      </span>
                      {item.meta && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            background: "var(--color-bg-hover)",
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          {item.meta}
                        </span>
                      )}
                      {isSelected && (
                        <ArrowRight
                          size={12}
                          className="shrink-0"
                          style={{ color: "var(--color-text-tertiary)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-[11px]"
          style={{
            borderTop: "1px solid var(--color-border-default)",
            color: "var(--color-text-tertiary)",
          }}
        >
          <span className="flex items-center gap-1">
            <kbd className="rounded px-1 py-0.5 text-[10px]" style={{ background: "var(--color-bg-hover)" }}>↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded px-1 py-0.5 text-[10px]" style={{ background: "var(--color-bg-hover)" }}>↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded px-1 py-0.5 text-[10px]" style={{ background: "var(--color-bg-hover)" }}>esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
