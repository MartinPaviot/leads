/**
 * In-memory registry of every keyboard shortcut mounted on the page.
 * Used by `<ShortcutHelp />` to render a live cheatsheet. Not persisted —
 * contents reset on page reload.
 */

export interface RegisteredShortcut {
  combo: string;
  description: string;
  group: string;
}

type Listener = (shortcuts: RegisteredShortcut[]) => void;

const shortcuts = new Map<string, RegisteredShortcut>();
const listeners = new Set<Listener>();

function emit() {
  const snapshot = Array.from(shortcuts.values());
  for (const l of listeners) l(snapshot);
}

export function registerShortcut(s: RegisteredShortcut): () => void {
  shortcuts.set(s.combo, s);
  emit();
  return () => {
    shortcuts.delete(s.combo);
    emit();
  };
}

export function unregisterShortcut(combo: string) {
  if (shortcuts.delete(combo)) emit();
}

export function getRegisteredShortcuts(): RegisteredShortcut[] {
  return Array.from(shortcuts.values());
}

export function subscribeShortcuts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reset — exported for tests. */
export function _resetShortcutRegistry() {
  shortcuts.clear();
  emit();
}
