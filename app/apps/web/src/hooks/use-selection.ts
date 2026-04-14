"use client";

import { useCallback, useMemo, useState } from "react";

export interface UseSelectionReturn<T extends { id: string }> {
  selected: Set<string>;
  /** True if `id` (or item.id) is in the current selection. */
  isSelected: (idOrItem: string | T) => boolean;
  /** Flip the selection of a single id. */
  toggle: (idOrItem: string | T) => void;
  /** Select ALL currently-known items (whatever `items` you pass in
   *  on render). Pass the CURRENT visible list — the hook is stateful
   *  on ids only so it respects filters. */
  selectAll: (items: T[]) => void;
  /** Clear selection entirely. */
  clear: () => void;
  /** Replace the whole selection with the given ids. */
  set: (next: string[] | Set<string>) => void;
  /** Pair well with `items`: true if every visible id is in the set. */
  allSelectedIn: (items: T[]) => boolean;
  /** Same idea: true if some (but not all) are selected. */
  partiallySelectedIn: (items: T[]) => boolean;
  count: number;
}

/**
 * Stable selection tracker keyed on `id`. Keeps a Set internally so
 * O(1) membership checks scale to 10k rows.
 */
export function useSelection<T extends { id: string }>(): UseSelectionReturn<T> {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const resolveId = (idOrItem: string | T): string =>
    typeof idOrItem === "string" ? idOrItem : idOrItem.id;

  const isSelected = useCallback(
    (idOrItem: string | T) => selected.has(resolveId(idOrItem)),
    [selected]
  );

  const toggle = useCallback((idOrItem: string | T) => {
    const id = resolveId(idOrItem);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: T[]) => {
    setSelected(new Set(items.map((i) => i.id)));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const set = useCallback((next: string[] | Set<string>) => {
    setSelected(next instanceof Set ? new Set(next) : new Set(next));
  }, []);

  const allSelectedIn = useCallback(
    (items: T[]) => items.length > 0 && items.every((i) => selected.has(i.id)),
    [selected]
  );
  const partiallySelectedIn = useCallback(
    (items: T[]) => {
      let any = false;
      let all = true;
      for (const i of items) {
        if (selected.has(i.id)) any = true;
        else all = false;
        if (any && !all) return true;
      }
      return any && !all;
    },
    [selected]
  );

  const count = useMemo(() => selected.size, [selected]);

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    clear,
    set,
    allSelectedIn,
    partiallySelectedIn,
    count,
  };
}
