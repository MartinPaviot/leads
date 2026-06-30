"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListPlus, ChevronDown, Check, Pencil, Trash2, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/locale";

export interface AccountListItem {
  id: string;
  name: string;
  count: number;
}

/**
 * Account-lists picker — a single dropdown that scales to any number of lists.
 * Replaces the row of horizontally-scrolling chips: with many lists those
 * scrolled awkwardly inside the filter bar. The trigger shows the ACTIVE list
 * (so the current scope stays visible) or "Lists (N)" when none is active.
 *
 * Inside: click a row to scope the view to that list (click the active one — or
 * "Leave list" — to clear). Per-row rename (inline) and delete live on hover /
 * keyboard focus. A search box appears past 7 lists. The dropdown is NOT inside
 * an overflow-scroll container, so a normal absolute panel is fine (no portal).
 */
export function ListsMenu({
  lists,
  activeListId,
  onSelect,
  onRename,
  onDelete,
}: {
  lists: AccountListItem[];
  activeListId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameIntent = useRef<"commit" | "cancel">("commit");
  const ref = useRef<HTMLDivElement>(null);

  const active = lists.find((l) => l.id === activeListId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? lists.filter((l) => l.name.toLowerCase().includes(q)) : lists;
  }, [lists, query]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setRenamingId(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function startRename(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
  }
  function commitRename(id: string) {
    if (renameIntent.current === "cancel") {
      setRenamingId(null);
      renameIntent.current = "commit";
      return;
    }
    onRename(id, renameValue);
    setRenamingId(null);
    renameIntent.current = "commit";
  }

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("accountLists.menu.aria")}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
        style={{
          background: active ? "var(--color-accent-soft)" : "transparent",
          color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      >
        <ListPlus size={12} style={{ opacity: 0.8 }} />
        <span className="max-w-[160px] truncate">{active ? active.name : t("accountLists.menu.label")}</span>
        <span className="tabular-nums" style={{ opacity: 0.7 }}>{active ? active.count : lists.length}</span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg py-1"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-moderate)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          {lists.length > 7 && (
            <div className="px-2 pb-1 pt-0.5">
              <div className="relative flex items-center">
                <Search size={12} className="absolute left-2" style={{ color: "var(--color-text-muted)" }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("accountLists.menu.search")}
                  className="h-7 w-full rounded-md pl-7 pr-2 text-[12px]"
                  style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
                />
              </div>
            </div>
          )}

          {active && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { onSelect(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <X size={13} style={{ color: "var(--color-text-tertiary)" }} />
              {t("accountLists.menu.leave")}
            </button>
          )}

          <div className="max-h-[320px] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                {t("accountLists.menu.noMatch")}
              </div>
            ) : (
              filtered.map((l) => {
                const isActive = l.id === activeListId;
                if (renamingId === l.id) {
                  return (
                    <div key={l.id} className="px-2 py-1">
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={120}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { renameIntent.current = "commit"; e.currentTarget.blur(); }
                          else if (e.key === "Escape") { renameIntent.current = "cancel"; e.currentTarget.blur(); }
                        }}
                        onBlur={() => commitRename(l.id)}
                        aria-label={t("accountLists.chip.renameAria", { name: l.name })}
                        className="h-7 w-full rounded-md px-2 text-[12px] font-medium outline-none"
                        style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-accent)" }}
                      />
                    </div>
                  );
                }
                return (
                  <div key={l.id} className="group flex items-center pr-1.5 transition-colors hover:bg-[var(--color-bg-hover)]">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => { onSelect(isActive ? null : l.id); setOpen(false); }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px]"
                      style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-primary)" }}
                    >
                      <ListPlus size={13} style={{ opacity: 0.6 }} />
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      <span className="tabular-nums text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{l.count}</span>
                      {isActive && <Check size={13} style={{ color: "var(--color-accent)" }} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(l.id, l.name)}
                      aria-label={t("accountLists.chip.renameAria", { name: l.name })}
                      title={t("accountLists.chip.renameTitle")}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--color-bg-card)] focus:opacity-100 group-hover:opacity-100"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(l.id, l.name)}
                      aria-label={t("accountLists.chip.deleteAria", { name: l.name })}
                      title={t("accountLists.chip.deleteTitle")}
                      className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--color-bg-card)] focus:opacity-100 group-hover:opacity-100"
                      style={{ color: "var(--color-danger, #dc2626)" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
