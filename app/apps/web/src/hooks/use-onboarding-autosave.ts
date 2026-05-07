"use client";

/**
 * useOnboardingAutosave — wizard-side hook for per-phase autosave
 * (P0-3 task 3.7).
 *
 * Inputs :
 *   tenantId — needed for namespace isolation. When null/empty,
 *     the hook is a no-op (autosave silently disabled).
 *   phase — 1..7. Pure helpers throw on out-of-range so we wrap
 *     defensively.
 *   draft — the live form state. Stringified + diffed against the
 *     last persisted value to skip pointless writes.
 *   debounceMs — write debounce. Default 600ms : faster than
 *     every-keystroke, slow enough that the user pause feels
 *     deliberate.
 *
 * Behaviour :
 *   - Mount : hydrate from localStorage if a fresh draft exists.
 *   - Type  : debounced save.
 *   - Unmount / page-hide : flush pending write so a tab switch
 *     doesn't lose the last few keystrokes.
 *   - Phase change : the hook unmounts, flushes, then re-mounts
 *     fresh under the new phase key.
 *
 * Returns { hydratedFrom, clearLocal }.
 *   hydratedFrom — "local" | "server" | "none". Surfaced so the
 *     wizard can show "draft restored" UX.
 *   clearLocal — call after a successful submit to drop the
 *     localStorage entry (it's now superseded by server state).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDebouncer,
  loadDraft,
  saveDraft,
  clearDraft,
  pickDraft,
  safeStorageAdapter,
  type StorageAdapter,
} from "@/lib/onboarding/autosave";

interface UseOnboardingAutosaveArgs<T> {
  tenantId: string | null | undefined;
  phase: number;
  draft: T;
  /** Server-side prior data — used as the fallback if no local
   *  draft is present. */
  serverPrior?: T | null;
  debounceMs?: number;
  /** Override storage for tests. Defaults to window.localStorage. */
  storage?: StorageAdapter;
}

export interface OnboardingAutosaveResult<T> {
  hydratedFrom: "local" | "server" | "none";
  hydratedDraft: T | null;
  clearLocal: () => void;
}

export function useOnboardingAutosave<T>(
  args: UseOnboardingAutosaveArgs<T>,
): OnboardingAutosaveResult<T> {
  const { tenantId, phase, draft, serverPrior, debounceMs = 600 } = args;

  const storage = useMemo<StorageAdapter>(
    () =>
      args.storage ??
      safeStorageAdapter(
        typeof window !== "undefined" ? window.localStorage : null,
      ),
    [args.storage],
  );

  // Read once on mount (or when tenant/phase change). Subsequent
  // re-renders skip the read so a noisy state setter doesn't
  // hammer storage.
  const [hydratedFrom, setHydratedFrom] = useState<
    "local" | "server" | "none"
  >("none");
  const [hydratedDraft, setHydratedDraft] = useState<T | null>(null);
  const lastSerialisedRef = useRef<string | null>(null);

  // Hydrate. Pure helpers handle bad inputs gracefully.
  useEffect(() => {
    if (!tenantId) {
      setHydratedFrom("none");
      setHydratedDraft(null);
      return;
    }
    const local = loadDraft<T>(storage, tenantId, phase);
    const decision = pickDraft<T>(local, serverPrior);
    if (decision.source === "local" || decision.source === "server") {
      setHydratedFrom(decision.source);
      setHydratedDraft(decision.payload);
    } else {
      setHydratedFrom("none");
      setHydratedDraft(null);
    }
    lastSerialisedRef.current = local
      ? JSON.stringify(local.payload)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, phase]);

  // Debounced writer. Held in a ref so re-renders don't recreate
  // the timer.
  const debouncedWriteRef = useRef<ReturnType<
    typeof createDebouncer<[T]>
  > | null>(null);

  if (!debouncedWriteRef.current && tenantId) {
    debouncedWriteRef.current = createDebouncer<[T]>((payload) => {
      const serialised = JSON.stringify(payload);
      if (serialised === lastSerialisedRef.current) return;
      saveDraft(storage, tenantId, phase, payload);
      lastSerialisedRef.current = serialised;
    }, debounceMs);
  }

  // Reset debouncer when tenant/phase change so writes don't bleed
  // across phases.
  useEffect(() => {
    debouncedWriteRef.current?.cancel();
    debouncedWriteRef.current = tenantId
      ? createDebouncer<[T]>((payload) => {
          const serialised = JSON.stringify(payload);
          if (serialised === lastSerialisedRef.current) return;
          saveDraft(storage, tenantId, phase, payload);
          lastSerialisedRef.current = serialised;
        }, debounceMs)
      : null;
    return () => {
      // Flush on unmount (phase change, navigation away).
      debouncedWriteRef.current?.flush();
    };
  }, [tenantId, phase, storage, debounceMs]);

  // Schedule a save whenever the live draft changes.
  useEffect(() => {
    if (!tenantId) return;
    debouncedWriteRef.current?.(draft);
  }, [tenantId, draft]);

  // Page-hide flush — tab close / refresh / nav-away. Catches the
  // race where the user types, hits ⌘W within the debounce window,
  // and the timer never fires.
  useEffect(() => {
    if (!tenantId) return;
    const flush = () => debouncedWriteRef.current?.flush();
    if (typeof window === "undefined") return;
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [tenantId]);

  return {
    hydratedFrom,
    hydratedDraft,
    clearLocal: () => {
      if (!tenantId) return;
      clearDraft(storage, tenantId, phase);
      lastSerialisedRef.current = null;
    },
  };
}
