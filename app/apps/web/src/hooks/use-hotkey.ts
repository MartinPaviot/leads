"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight keyboard-shortcut hook. Zero dependencies.
 *
 * Combo syntax:
 *   - plain keys: `"c"`, `"/"`, `"?"`, `"Escape"`, `"ArrowDown"` ...
 *   - modifiers:  `"cmd+k"` (Meta or Ctrl, whichever the OS uses),
 *                 `"ctrl+k"` (strict Ctrl), `"shift+?"`, `"alt+n"`.
 *   - combinations: `"cmd+shift+p"`, `"ctrl+alt+s"`.
 *
 * By default fires only when the user is NOT typing in an input /
 * textarea / contenteditable. Pass `{ allowWhileTyping: true }` when
 * that's needed (e.g. ⌘K globally).
 *
 * Also auto-registers itself in the shortcut registry so the
 * `<ShortcutHelp />` overlay can enumerate every live binding.
 */

import { registerShortcut, unregisterShortcut } from "@/lib/hotkey-registry";

export interface UseHotkeyOptions {
  /** Allow firing while focus is inside an input/textarea/contenteditable. */
  allowWhileTyping?: boolean;
  /** Human-readable label shown in the shortcut help overlay. */
  description?: string;
  /** Category bucket for the help overlay (e.g. "Navigation"). */
  group?: string;
  /** Disable the hook without unmounting. */
  enabled?: boolean;
}

export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: UseHotkeyOptions = {}
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const { allowWhileTyping = false, description, group, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const parsed = parseCombo(combo);
    const unregister = description
      ? registerShortcut({ combo, description, group: group ?? "General" })
      : null;

    function onKeyDown(e: KeyboardEvent) {
      if (!allowWhileTyping && isTyping(e)) return;
      if (!matches(e, parsed)) return;
      e.preventDefault();
      handlerRef.current(e);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unregister?.();
      if (description) unregisterShortcut(combo);
    };
  }, [combo, allowWhileTyping, description, group, enabled]);
}

interface ParsedCombo {
  key: string;
  cmd?: boolean; // cmd OR ctrl
  strictCtrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Exported for tests. */
export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: ParsedCombo = { key: "" };
  for (const p of parts) {
    if (p === "cmd" || p === "mod" || p === "meta") out.cmd = true;
    else if (p === "ctrl") out.strictCtrl = true;
    else if (p === "shift") out.shift = true;
    else if (p === "alt" || p === "option") out.alt = true;
    else out.key = p;
  }
  return out;
}

function matches(e: KeyboardEvent, c: ParsedCombo): boolean {
  if (c.cmd && !(e.metaKey || e.ctrlKey)) return false;
  if (c.strictCtrl && !e.ctrlKey) return false;
  if (c.shift && !e.shiftKey) return false;
  if (c.alt && !e.altKey) return false;
  const key = e.key.toLowerCase();
  return key === c.key;
}

function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
