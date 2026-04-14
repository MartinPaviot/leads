"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  getRegisteredShortcuts,
  subscribeShortcuts,
  type RegisteredShortcut,
} from "@/lib/hotkey-registry";
import { useHotkey } from "@/hooks/use-hotkey";

/**
 * Overlay listing every live keyboard shortcut, grouped by category.
 * Press `?` to open; press `?` or Escape again to close. Mount once
 * in the dashboard layout.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<RegisteredShortcut[]>(() =>
    getRegisteredShortcuts()
  );

  useEffect(() => subscribeShortcuts(setShortcuts), []);

  useHotkey("shift+?", () => setOpen((v) => !v), {
    description: "Show keyboard shortcuts",
    group: "Help",
  });
  useHotkey("Escape", () => setOpen(false), {
    enabled: open,
    description: "Close shortcut help",
    group: "Help",
  });

  if (!open) return null;

  const groups = new Map<string, RegisteredShortcut[]>();
  for (const s of shortcuts) {
    const bucket = groups.get(s.group) ?? [];
    bucket.push(s);
    groups.set(s.group, bucket);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Keyboard shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          {groups.size === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
              No shortcuts registered on this page.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {Array.from(groups.entries()).map(([group, items]) => (
                <section key={group}>
                  <h3
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {group}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {items.map((s) => (
                      <li key={s.combo} className="flex items-center justify-between text-[13px]">
                        <span style={{ color: "var(--color-text-secondary)" }}>{s.description}</span>
                        <kbd
                          className="rounded px-2 py-0.5 text-[11px] font-mono"
                          style={{
                            background: "var(--color-bg-hover)",
                            color: "var(--color-text-primary)",
                            border: "1px solid var(--color-border-default)",
                          }}
                        >
                          {prettyCombo(s.combo)}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

export function prettyCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => {
      const p = part.toLowerCase();
      if (p === "cmd" || p === "mod" || p === "meta") return isMac ? "⌘" : "Ctrl";
      if (p === "ctrl") return isMac ? "⌃" : "Ctrl";
      if (p === "shift") return isMac ? "⇧" : "Shift";
      if (p === "alt" || p === "option") return isMac ? "⌥" : "Alt";
      if (p === "escape") return "Esc";
      if (p === "arrowleft") return "←";
      if (p === "arrowright") return "→";
      if (p === "arrowup") return "↑";
      if (p === "arrowdown") return "↓";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(isMac ? "" : "+");
}
