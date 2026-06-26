"use client";

/**
 * Cmd/Ctrl+K command palette (INBOX-K01) — fuzzy-jump to any loaded
 * conversation and run lane/triage actions without leaving the keyboard.
 * Ranking is the pure, unit-tested fuzzyRank; this is the surface on top.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { fuzzyRank } from "@/lib/inbox/fuzzy";
import type { PaletteCommand } from "@/lib/inbox/palette-commands";
import { useT } from "@/lib/i18n/locale";

// Re-export so existing `./_command-palette` importers keep resolving the type;
// the canonical definition + the pure builder live in lib/inbox/palette-commands.
export type { PaletteCommand };

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo(() => fuzzyRank(commands, query).slice(0, 50), [commands, query]);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keep the active index in range as the list shrinks.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, ranked.length - 1)));
  }, [ranked.length]);

  if (!open) return null;

  function runCmd(cmd?: PaletteCommand) {
    if (!cmd) return;
    cmd.run();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: "var(--color-bg-modal-overlay)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border"
        style={{
          borderColor: "var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-panel)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, ranked.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              runCmd(ranked[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={t("inbox.palette.placeholder")}
          className="w-full border-b bg-transparent px-4 py-3 text-[13px] outline-none"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {ranked.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {t("inbox.palette.noMatches")}
            </div>
          ) : (
            ranked.map((cmd, i) => (
              <button
                key={cmd.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => runCmd(cmd)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left"
                style={{ background: i === active ? "var(--color-accent-soft)" : "transparent" }}
              >
                <span className="truncate text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                  {cmd.label}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {cmd.shortcut && (
                    <kbd
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
                      style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                  {cmd.hint && (
                    <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {cmd.hint}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
