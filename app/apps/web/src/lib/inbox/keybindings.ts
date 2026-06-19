/**
 * Keyboard shortcut resolver + registry (INBOX-K07 core). Pure + unit-tested.
 *
 * normalizeKey turns a key event into a canonical chord ("shift+e", "g", "?");
 * resolveKey maps a chord to its action; findConflicts surfaces two actions bound
 * to the same chord so the customizer can warn. The actual key listener, the
 * settings UI, and the default map are wiring on top (residual).
 */

export interface KeyBinding {
  /** Canonical chord, e.g. "shift+e", "g", "?". */
  keys: string;
  action: string;
}

export interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function normalizeKey(e: KeyEventLike): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push((e.key || "").toLowerCase());
  return parts.join("+");
}

export function resolveKey(bindings: KeyBinding[], chord: string): string | null {
  const c = chord.toLowerCase();
  const b = bindings.find((x) => x.keys.toLowerCase() === c);
  return b ? b.action : null;
}

export function findConflicts(bindings: KeyBinding[]): Array<{ keys: string; actions: string[] }> {
  const byKeys = new Map<string, string[]>();
  for (const b of bindings) {
    const k = b.keys.toLowerCase();
    byKeys.set(k, [...(byKeys.get(k) ?? []), b.action]);
  }
  return [...byKeys.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([keys, actions]) => ({ keys, actions }));
}
